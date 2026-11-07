// 다시 볼 날 발송 본체 — 순수 규칙(schedule.ts)으로 예약마다 판정하고 Expo 로 보낸다.
// 저장소·Expo 는 인자로 받는다(시험은 메모리 가짜). 한 예약의 실패가 다른 예약을 막지 않는다.
import { kstDate } from "../admin-time.ts";
import { logError, logWarn } from "@/lib/logger";
import type { ExpoMessage, ExpoTicket, ExpoReceipt } from "./expo.ts";
import { decideRevisit, revisitWindow } from "./schedule.ts";
import { readingPath, revisitMessage } from "./templates.ts";

export type DueRevisit = { id: string; userId: string; readingId: string; consultationType: string; sendOn: string };
type TicketRef = { id: string; token: string };

export interface DispatchStore {
  dueRevisits(todayKst: string): Promise<DueRevisit[]>;
  activeDeviceTokens(userId: string): Promise<string[]>;
  getRevisitPref(userId: string): Promise<boolean>;
  /** 새 push_sends id. 이미 기록이 있으면(유니크 위반) null. */
  claimSend(r: { userId: string; kind: "revisit"; klass: "info"; refId: string; sendDate: string }): Promise<number | null>;
  /** 그 선점 기록에 실제로 나간 티켓이 있는지(device_count > 0) — 앞 실행이 보내고 sent 표시만 못 한 경우를 가린다. */
  deliveredSend(r: { userId: string; kind: "revisit"; refId: string; sendDate: string }): Promise<boolean>;
  /** 발송이 통째로 실패했을 때 선점 기록을 지워 다음 실행이 다시 잡게 한다. */
  releaseSend(sendId: number): Promise<void>;
  saveTickets(sendId: number, tickets: TicketRef[]): Promise<void>;
  markSchedule(id: string, status: "sent" | "skipped"): Promise<void>;
  disableTokens(tokens: string[]): Promise<void>;
  uncheckedReceipts(beforeIso: string): Promise<{ sendId: number; sentAt: string; tickets: TicketRef[] }[]>;
  markReceiptsChecked(sendIds: number[]): Promise<void>;
}

export type ExpoApi = {
  send: (msgs: ExpoMessage[]) => Promise<ExpoTicket[]>;
  receipts: (ids: string[]) => Promise<Record<string, ExpoReceipt>>;
};

export type DispatchResult = { sent: number; skipped: number; disabled: number; failed: number };

const RECEIPT_DELAY_MS = 15 * 60 * 1000;
/** Expo 는 영수증을 ~24시간만 둔다 — 이보다 오래된 발송은 빠진 영수증이 끝내 안 오니 확인 처리한다 */
const RECEIPT_GIVE_UP_MS = 24 * 60 * 60 * 1000;
/** cron maxDuration 60초 — 이만큼 지나면 새 예약을 시작하지 않는다(남은 건 pending 그대로라 다음 실행이 잡는다) */
const TIME_BUDGET_MS = 45 * 1000;

export type LogFn = (err: unknown, ctx?: { route?: string; extra?: Record<string, unknown> }) => unknown;
export type WarnFn = (message: string, ctx?: { route?: string; extra?: Record<string, unknown> }) => unknown;

const ROUTE = "cron/push-dispatch";
const DNR = "DeviceNotRegistered";

/** log·warn 은 시험에서 기록기를 꽂는 자리 — 기본은 실제 로거. */
export async function dispatchRevisits(
  now: Date,
  store: DispatchStore,
  expo: ExpoApi,
  log: LogFn = logError,
  opts: { warn?: WarnFn; clock?: () => number } = {},
): Promise<DispatchResult> {
  const warn = opts.warn ?? logWarn;
  const clock = opts.clock ?? Date.now;
  const startedAt = clock();
  const result: DispatchResult = { sent: 0, skipped: 0, disabled: 0, failed: 0 };
  const today = kstDate(now.toISOString());
  // DeviceNotRegistered 말고 Expo 가 돌려준 오류 — 코드별로 모아 실행 끝에 코드당 한 번 경고한다(조용히 '보냄'으로 세지 않게)
  const expoErrors = new Map<string, { tickets: number; receipts: number }>();
  const countError = (code: string | undefined, where: "tickets" | "receipts") => {
    const k = code || "unknown";
    const c = expoErrors.get(k) ?? { tickets: 0, receipts: 0 };
    c[where]++;
    expoErrors.set(k, c);
  };

  for (const r of await store.dueRevisits(today)) {
    if (clock() - startedAt >= TIME_BUDGET_MS) break;
    try {
      const w = revisitWindow(r.sendOn, now);
      if (w === "early") continue;
      if (w === "missed") {
        await store.markSchedule(r.id, "skipped");
        result.skipped++;
        continue;
      }
      const tokens = await store.activeDeviceTokens(r.userId);
      const pref = await store.getRevisitPref(r.userId);
      const path = readingPath(r.consultationType, r.readingId);
      if (!decideRevisit({ activeDevices: tokens.length, revisitPref: pref }).send || path === null) {
        await store.markSchedule(r.id, "skipped");
        result.skipped++;
        continue;
      }
      const sendId = await store.claimSend({ userId: r.userId, kind: "revisit", klass: "info", refId: r.id, sendDate: today });
      if (sendId === null) {
        // 이미 기록이 있다 — 앞 실행이 보내고 sent 표시에서 실패했으면 여기서 맞춘다(그냥 두면 밤에 skipped 가 되어
        // 카드가 '지났어'로 보인다). 티켓 없는 선점만 남은 경우(보내기 전에 죽음)는 그대로 둔다
        if (await store.deliveredSend({ userId: r.userId, kind: "revisit", refId: r.id, sendDate: today })) {
          await store.markSchedule(r.id, "sent");
        }
        continue;
      }

      const { title, body } = revisitMessage();
      const msgs: ExpoMessage[] = tokens.map((to) => ({
        to, title, body, data: { path, kind: "revisit", sendId }, sound: "default", channelId: "info",
      }));
      let tickets: ExpoTicket[];
      try {
        tickets = await expo.send(msgs);
      } catch (e) {
        await store.releaseSend(sendId); // 선점이 남아 다음 실행의 재시도를 막지 않게
        throw e;
      }
      const ok: TicketRef[] = [];
      const dead: string[] = [];
      tickets.forEach((t, i) => {
        if (t.status === "ok") ok.push({ id: t.id, token: tokens[i] });
        else if (t.details?.error === DNR) dead.push(tokens[i]);
        else countError(t.details?.error, "tickets");
      });
      if (dead.length) {
        await store.disableTokens(dead);
        result.disabled += dead.length;
      }
      if (ok.length === 0) {
        // 한 기기에도 안 나갔다 — 통째 실패와 같게 선점을 풀고 pending 으로 둔다(다음 실행이 다시 잡거나, 기기가 없으면 skipped)
        await store.releaseSend(sendId);
        result.failed++;
        continue;
      }
      await store.saveTickets(sendId, ok);
      await store.markSchedule(r.id, "sent");
      result.sent++;
    } catch (e) {
      result.failed++;
      await log(e, { route: ROUTE, extra: { scheduleId: r.id } });
    }
  }

  try {
    const pending = await store.uncheckedReceipts(new Date(now.getTime() - RECEIPT_DELAY_MS).toISOString());
    if (pending.length > 0) {
      const ids = pending.flatMap((p) => p.tickets.map((t) => t.id));
      const byId = ids.length > 0 ? await expo.receipts(ids) : {};
      const dead = new Set<string>();
      // 티켓 영수증이 전부 나온 발송만 확인 표시 — 아직 안 나온 게 있으면 다음 실행이 다시 본다.
      // 단 하루가 지난 발송은 빠진 게 있어도 확인 처리한다(끝내 안 온다 — 남겨 두면 조회 상한을 막는다)
      const complete: number[] = [];
      const giveUpBefore = now.getTime() - RECEIPT_GIVE_UP_MS;
      let missingPastCutoff = 0;
      for (const p of pending) {
        const missing = p.tickets.filter((t) => !Object.hasOwn(byId, t.id)).length;
        if (missing === 0) complete.push(p.sendId);
        else if (Date.parse(p.sentAt) < giveUpBefore) {
          complete.push(p.sendId);
          missingPastCutoff += missing;
        }
        for (const t of p.tickets) {
          const rc = byId[t.id];
          if (rc?.status !== "error") continue;
          if (rc.details?.error === DNR) dead.add(t.token);
          else countError(rc.details?.error, "receipts");
        }
      }
      if (dead.size) {
        await store.disableTokens([...dead]);
        result.disabled += dead.size;
      }
      await store.markReceiptsChecked(complete);
      if (missingPastCutoff > 0) {
        await warn("expo push receipts missing past 24h", { route: ROUTE, extra: { count: missingPastCutoff } });
      }
    }
  } catch (e) {
    await log(e, { route: ROUTE, extra: { phase: "receipts" } });
  }

  for (const [code, c] of expoErrors) {
    await warn(`expo push error ${code}`, { route: ROUTE, extra: { code, tickets: c.tickets, receipts: c.receipts } });
  }
  return result;
}
