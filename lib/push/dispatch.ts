// 알림 발송 본체(cron) — 다시 볼 날을 먼저 보내고, 다른 종류(2년 재확인·아침 흐름·이어가기·깨우기)는 jobs 로 이어 붙인 뒤 영수증을 본다.
// 보낼지는 순수 판정(decide.ts)이 정한다. 저장소·Expo 는 인자로 받는다(시험은 메모리 가짜). 한 건의 실패가 다른 건을 막지 않는다.
// 광고(klass "ad")는 여기서 수신거부 표를 붙인다 — data.unsub(알림의 [수신거부] 버튼) + 경로 #bku=(열린 화면의 철회 줄).
import { kstDate } from "../admin-time.ts";
import { logError, logWarn } from "@/lib/logger";
import type { ExpoMessage, ExpoTicket, ExpoReceipt } from "./expo.ts";
import { revisitWindow } from "./schedule.ts";
import { decidePush, type PushKind } from "./decide.ts";
import { readingPath, revisitMessage } from "./templates.ts";
import { makeUnsubToken } from "./unsub-token.ts";

export type DueRevisit = { id: string; userId: string; readingId: string; consultationType: string; sendOn: string };
type TicketRef = { id: string; token: string };

export interface DispatchStore {
  dueRevisits(todayKst: string): Promise<DueRevisit[]>;
  activeDeviceTokens(userId: string): Promise<string[]>;
  getRevisitPref(userId: string): Promise<boolean>;
  /** 새 push_sends id. 이미 기록이 있으면(유니크 위반) null. */
  claimSend(r: { userId: string; kind: PushKind; klass: "info" | "ad"; refId: string; sendDate: string }): Promise<number | null>;
  /** 그 선점 기록에 실제로 나간 티켓이 있는지(device_count > 0) — 앞 실행이 보내고 sent 표시만 못 한 경우를 가린다. */
  deliveredSend(r: { userId: string; kind: PushKind; refId: string; sendDate: string }): Promise<boolean>;
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

/** 한 회원에게 한 건 보내기 — 선점(중복 방지) → 표(광고) → Expo → 죽은 토큰 끄기 → 티켓 저장.
 *  sent = 한 기기 이상에 나감 / dup = 오늘 이미 선점된 건(delivered = 그 선점에 나간 티켓이 있음) / failed = 한 기기에도 안 나감(선점을 풀었다).
 *  Expo 호출이 통째로 실패하면 선점을 풀고 던진다(부르는 쪽이 로그) */
export type DeliverOutcome = { outcome: "sent"; sendId: number } | { outcome: "dup"; delivered: boolean } | { outcome: "failed" };

export type DispatchCtx = {
  now: Date;
  today: string;
  store: DispatchStore;
  result: DispatchResult;
  log: LogFn;
  /** 시간 예산을 다 썼다 — 새 건을 시작하지 않는다(남은 건 다음 실행이 잡는다) */
  overBudget(): boolean;
  deliver(a: {
    userId: string;
    kind: PushKind;
    klass: "info" | "ad";
    refId: string;
    tokens: string[];
    path: string;
    message: { title: string; body: string };
  }): Promise<DeliverOutcome>;
};

/** 다시 볼 날 뒤에 차례로 도는 다른 종류의 발송 */
export type DispatchJob = (ctx: DispatchCtx) => Promise<void>;

/** log·warn 은 시험에서 기록기를 꽂는 자리 — 기본은 실제 로거. jobs 는 다시 볼 날 뒤에 차례로 돈다. unsubSecret 은 시험용(기본 AUTH_TOKEN_SECRET) */
export async function dispatchRevisits(
  now: Date,
  store: DispatchStore,
  expo: ExpoApi,
  log: LogFn = logError,
  opts: { warn?: WarnFn; clock?: () => number; jobs?: DispatchJob[]; unsubSecret?: string } = {},
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
  const overBudget = () => clock() - startedAt >= TIME_BUDGET_MS;

  const deliver: DispatchCtx["deliver"] = async (a) => {
    const sendId = await store.claimSend({ userId: a.userId, kind: a.kind, klass: a.klass, refId: a.refId, sendDate: today });
    if (sendId === null) {
      return { outcome: "dup", delivered: await store.deliveredSend({ userId: a.userId, kind: a.kind, refId: a.refId, sendDate: today }) };
    }
    let msgs: ExpoMessage[];
    try {
      const unsub = a.klass === "ad" ? makeUnsubToken(sendId, a.userId, opts.unsubSecret) : null;
      const path = unsub ? `${a.path}#bku=${unsub}` : a.path;
      msgs = a.tokens.map((to) => ({
        to,
        title: a.message.title,
        body: a.message.body,
        data: unsub ? { path, kind: a.kind, sendId, unsub } : { path, kind: a.kind, sendId },
        sound: "default",
        channelId: a.klass === "ad" ? "ad" : "info",
        ...(unsub ? { categoryId: "ad" as const } : {}),
      }));
    } catch (e) {
      await store.releaseSend(sendId); // 표를 못 만들었다(비밀값 없음) — 광고를 표 없이 보내지 않는다
      throw e;
    }
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
      if (t.status === "ok") ok.push({ id: t.id, token: a.tokens[i] });
      else if (t.details?.error === DNR) dead.push(a.tokens[i]);
      else countError(t.details?.error, "tickets");
    });
    if (dead.length) {
      await store.disableTokens(dead);
      result.disabled += dead.length;
    }
    if (ok.length === 0) {
      // 한 기기에도 안 나갔다 — 통째 실패와 같게 선점을 풀고 다음 실행에 맡긴다
      await store.releaseSend(sendId);
      return { outcome: "failed" };
    }
    await store.saveTickets(sendId, ok);
    return { outcome: "sent", sendId };
  };

  for (const r of await store.dueRevisits(today)) {
    if (overBudget()) break;
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
      // 다시 볼 날은 정보성(A) — 구독·동의·빈도·위기 신호와 상관없다
      const decision = decidePush({
        kind: "revisit", now, activeDevices: tokens.length, prefOn: pref,
        subscription: "none", adConsent: false, adSentToday: [], crisisWithin30d: false,
      });
      if (!decision.send || path === null) {
        await store.markSchedule(r.id, "skipped");
        result.skipped++;
        continue;
      }
      const d = await deliver({ userId: r.userId, kind: "revisit", klass: "info", refId: r.id, tokens, path, message: revisitMessage() });
      if (d.outcome === "dup") {
        // 이미 기록이 있다 — 앞 실행이 보내고 sent 표시에서 실패했으면 여기서 맞춘다(그냥 두면 밤에 skipped 가 되어
        // 카드가 '지났어'로 보인다). 티켓 없는 선점만 남은 경우(보내기 전에 죽음)는 그대로 둔다
        if (d.delivered) await store.markSchedule(r.id, "sent");
        continue;
      }
      if (d.outcome === "failed") {
        result.failed++;
        continue;
      }
      await store.markSchedule(r.id, "sent");
      result.sent++;
    } catch (e) {
      result.failed++;
      await log(e, { route: ROUTE, extra: { scheduleId: r.id } });
    }
  }

  const ctx: DispatchCtx = { now, today, store, result, log, overBudget, deliver };
  for (const job of opts.jobs ?? []) {
    if (overBudget()) break;
    try {
      await job(ctx);
    } catch (e) {
      await log(e, { route: ROUTE, extra: { phase: "job" } });
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
