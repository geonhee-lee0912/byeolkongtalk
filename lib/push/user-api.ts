// 알림 설정·질문 기록·다시 볼 날 예약 핸들러 — 라우트는 세션을 읽어 여기로 넘기기만 한다.
import { revisitSendOn, REVISIT_DAYS, type RevisitChoice } from "./schedule.ts";
import type { HandlerResult } from "./devices.ts";

const UNAUTH: HandlerResult = { status: 401, body: { error: "unauthorized" } };

function obj(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

export async function handleRevisitPost(
  body: unknown,
  userId: string | null,
  deps: {
    readingOwner(readingId: string): Promise<string | null>;
    upsertRevisit(userId: string, readingId: string, sendOn: string): Promise<"ok" | "already_sent">;
    now(): Date;
  },
): Promise<HandlerResult> {
  if (!userId) return UNAUTH;
  const { readingId, choice } = obj(body);
  if (typeof choice !== "string" || !Object.hasOwn(REVISIT_DAYS, choice)) return { status: 400, body: { error: "bad_choice" } };
  if (typeof readingId !== "string") return { status: 403, body: { error: "forbidden" } };
  // 없는 리딩과 남의 리딩을 같게 답한다 — 존재 여부를 흘리지 않는다.
  if ((await deps.readingOwner(readingId)) !== userId) return { status: 403, body: { error: "forbidden" } };
  const sendOn = revisitSendOn(choice as RevisitChoice, deps.now());
  if ((await deps.upsertRevisit(userId, readingId, sendOn)) === "already_sent") {
    return { status: 409, body: { error: "already_sent" } };
  }
  return { status: 200, body: { sendOn } };
}

/** 결과 화면 카드용 — 이 리딩의 예약과 다시 볼 날 설정. 설정이 꺼져 있으면 카드가 칩 대신 설정 안내를 보인다 */
export async function handleRevisitGet(
  readingId: string,
  userId: string | null,
  deps: {
    readingOwner(readingId: string): Promise<string | null>;
    getRevisit(userId: string, readingId: string): Promise<{ sendOn: string; status: string } | null>;
    getRevisitPref(userId: string): Promise<boolean>;
  },
): Promise<HandlerResult> {
  if (!userId) return UNAUTH;
  // 없는 리딩과 남의 리딩을 같게 답한다(403) — 존재 여부를 흘리지 않는다.
  if ((await deps.readingOwner(readingId)) !== userId) return { status: 403, body: { error: "forbidden" } };
  const [revisit, revisitPref] = await Promise.all([deps.getRevisit(userId, readingId), deps.getRevisitPref(userId)]);
  return { status: 200, body: { revisit, revisitPref } };
}

const ANSWERS = ["accepted", "later", "os_denied"] as const;

export async function handleAskPost(
  body: unknown,
  userId: string | null,
  deps: { recordAsk(userId: string, moment: "first_reading_end", answer: "accepted" | "later" | "os_denied"): Promise<void> },
): Promise<HandlerResult> {
  if (!userId) return UNAUTH;
  const { moment, answer } = obj(body);
  if (moment !== "first_reading_end") return { status: 400, body: { error: "bad_moment" } };
  if (typeof answer !== "string" || !(ANSWERS as readonly string[]).includes(answer)) {
    return { status: 400, body: { error: "bad_answer" } };
  }
  await deps.recordAsk(userId, moment, answer as (typeof ANSWERS)[number]);
  return { status: 200, body: { ok: true } };
}

export async function handleSettingsPost(
  body: unknown,
  userId: string | null,
  deps: { setRevisitPref(userId: string, on: boolean): Promise<void> },
): Promise<HandlerResult> {
  if (!userId) return UNAUTH;
  const { revisit } = obj(body);
  if (typeof revisit !== "boolean") return { status: 400, body: { error: "bad_revisit" } };
  await deps.setRevisitPref(userId, revisit);
  return { status: 200, body: { ok: true } };
}
