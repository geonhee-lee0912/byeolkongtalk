// 다시 볼 날 발송 본체 — 순수 규칙(schedule.ts)으로 예약마다 판정하고 Expo 로 보낸다.
// 저장소·Expo 는 인자로 받는다(시험은 메모리 가짜). 한 예약의 실패가 다른 예약을 막지 않는다.
import { kstDate } from "../admin-time.ts";
import { logError } from "@/lib/logger";
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
  /** 발송이 통째로 실패했을 때 선점 기록을 지워 다음 실행이 다시 잡게 한다. */
  releaseSend(sendId: number): Promise<void>;
  saveTickets(sendId: number, tickets: TicketRef[]): Promise<void>;
  markSchedule(id: string, status: "sent" | "skipped"): Promise<void>;
  disableTokens(tokens: string[]): Promise<void>;
  uncheckedReceipts(beforeIso: string): Promise<{ sendId: number; tickets: TicketRef[] }[]>;
  markReceiptsChecked(sendIds: number[]): Promise<void>;
}

export type ExpoApi = {
  send: (msgs: ExpoMessage[]) => Promise<ExpoTicket[]>;
  receipts: (ids: string[]) => Promise<Record<string, ExpoReceipt>>;
};

export type DispatchResult = { sent: number; skipped: number; disabled: number; failed: number };

const RECEIPT_DELAY_MS = 15 * 60 * 1000;

export type LogFn = (err: unknown, ctx?: { route?: string; extra?: Record<string, unknown> }) => unknown;

/** log 는 시험에서 기록기를 꽂는 자리 — 기본은 실제 로거. */
export async function dispatchRevisits(
  now: Date,
  store: DispatchStore,
  expo: ExpoApi,
  log: LogFn = logError,
): Promise<DispatchResult> {
  const result: DispatchResult = { sent: 0, skipped: 0, disabled: 0, failed: 0 };
  const today = kstDate(now.toISOString());

  for (const r of await store.dueRevisits(today)) {
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
      if (sendId === null) continue; // 이미 보낸 기록이 있다

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
        else if (t.details?.error === "DeviceNotRegistered") dead.push(tokens[i]);
      });
      await store.saveTickets(sendId, ok);
      if (dead.length) {
        await store.disableTokens(dead);
        result.disabled += dead.length;
      }
      await store.markSchedule(r.id, "sent");
      result.sent++;
    } catch (e) {
      result.failed++;
      await log(e, { route: "cron/push-dispatch", extra: { scheduleId: r.id } });
    }
  }

  try {
    const pending = await store.uncheckedReceipts(new Date(now.getTime() - RECEIPT_DELAY_MS).toISOString());
    if (pending.length > 0) {
      const ids = pending.flatMap((p) => p.tickets.map((t) => t.id));
      const byId = ids.length > 0 ? await expo.receipts(ids) : {};
      const dead = new Set<string>();
      for (const p of pending) {
        for (const t of p.tickets) {
          const rc = byId[t.id];
          if (rc?.status === "error" && rc.details?.error === "DeviceNotRegistered") dead.add(t.token);
        }
      }
      if (dead.size) {
        await store.disableTokens([...dead]);
        result.disabled += dead.size;
      }
      await store.markReceiptsChecked(pending.map((p) => p.sendId));
    }
  } catch (e) {
    await log(e, { route: "cron/push-dispatch", extra: { phase: "receipts" } });
  }
  return result;
}
