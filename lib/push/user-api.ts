// 알림 설정(광고 동의 포함)·질문·다시 볼 날 예약·수신거부 핸들러 — 라우트는 세션을 읽어 여기로 넘기기만 한다.
import { revisitSendOn, REVISIT_DAYS, type RevisitChoice } from "./schedule.ts";
import type { HandlerResult } from "./devices.ts";
import { ASK_MOMENTS, nextAsk, type AdStatus, type AskAnswer, type AskKind, type AskMoment, type AskRecord, type OsState } from "./asks.ts";
import { koreanDate, reconfirmState } from "./consent.ts";
import { readUnsubToken, verifyUnsubToken } from "./unsub-token.ts";

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
const OS_STATES = ["granted", "denied", "undetermined"] as const;

export type AdConsentRow = {
  status: "granted" | "withdrawn";
  firstGrantedAt: string;
  grantedAt: string;
  lastReconfirmNoticeAt: string | null;
} | null;

export type SetConsentResult =
  | { ok: true; changed: boolean; status: AdStatus; at: string }
  | { ok: false; reason: "token_used" | "token_invalid" };

/** 동의·철회 결과 → 화면이 띄울 결과 통지(§4-4). 바뀌지 않았으면 통지 없음 */
function noticeOf(r: { changed: boolean; status: AdStatus; at: string }): { kind: "grant" | "withdraw"; date: string } | null {
  if (!r.changed) return null;
  return { kind: r.status === "granted" ? "grant" : "withdraw", date: koreanDate(r.at) };
}

/** 묻는 순간 — 이 순간에 무엇을 물을지(서버가 기록·동의·구독으로 판정). moment·os 가 없으면 ask 는 null(기록만 돌려준다) */
export async function handleAskGet(
  query: { moment: string | null; os: string | null },
  userId: string | null,
  deps: {
    listAsks(userId: string): Promise<AskRecord[]>;
    getAdConsent(userId: string): Promise<AdConsentRow>;
    isSubscriber(userId: string): Promise<boolean>;
  },
): Promise<HandlerResult> {
  if (!userId) return UNAUTH;
  const [asks, consent] = await Promise.all([deps.listAsks(userId), deps.getAdConsent(userId)]);
  const ad: AdStatus = consent?.status ?? "none";
  const moment = (ASK_MOMENTS as readonly string[]).includes(query.moment ?? "") ? (query.moment as AskMoment) : null;
  const os = (OS_STATES as readonly string[]).includes(query.os ?? "") ? (query.os as OsState) : null;
  let ask: AskKind | null = null;
  if (moment && os) {
    // 구독 여부는 별마루 순간에서만 필요하다 — 다른 순간엔 읽지 않는다
    const subscriber = moment === "byeolmaru_first" ? await deps.isSubscriber(userId) : false;
    ask = nextAsk({ moment, os, ad, subscriber, asks });
  }
  return { status: 200, body: { moments: asks.map((a) => a.moment), ask, ad } };
}

export async function handleAskPost(
  body: unknown,
  userId: string | null,
  deps: { recordAsk(userId: string, moment: AskMoment, kind: AskKind, answer: AskAnswer): Promise<void> },
): Promise<HandlerResult> {
  if (!userId) return UNAUTH;
  const { moment, answer, kind = "push" } = obj(body);
  if (typeof moment !== "string" || !(ASK_MOMENTS as readonly string[]).includes(moment)) return { status: 400, body: { error: "bad_moment" } };
  if (kind !== "push" && kind !== "ad") return { status: 400, body: { error: "bad_kind" } };
  if (typeof answer !== "string" || !(ANSWERS as readonly string[]).includes(answer)) {
    return { status: 400, body: { error: "bad_answer" } };
  }
  await deps.recordAsk(userId, moment as AskMoment, kind, answer as AskAnswer);
  return { status: 200, body: { ok: true } };
}

/** 사용자가 직접 동의·철회를 바꾸는 자리 — 수신거부 버튼·줄은 표로 /api/push/unsubscribe 를 쓴다 */
const USER_SOURCES = [...ASK_MOMENTS, "settings", "reconfirm_popup"] as const;

export async function handleSettingsGet(
  userId: string | null,
  deps: {
    getRevisitPref(userId: string): Promise<boolean>;
    getAdConsent(userId: string): Promise<AdConsentRow>;
    now(): Date;
  },
): Promise<HandlerResult> {
  if (!userId) return UNAUTH;
  const [revisit, c] = await Promise.all([deps.getRevisitPref(userId), deps.getAdConsent(userId)]);
  const granted = c?.status === "granted";
  const reconfirm = granted && reconfirmState(c.firstGrantedAt, c.lastReconfirmNoticeAt, deps.now()).popup;
  return {
    status: 200,
    body: {
      revisit,
      ad: {
        status: c?.status ?? "none",
        // 동의일 — 가장 최근 동의(재동의했으면 그 날)
        grantedOn: granted ? koreanDate(c.grantedAt) : null,
        // 2년 재확인 팝업을 띄울 때(§4-5) — 띄웠으면 { reconfirmSeen: true } 로 알린다
        reconfirm: reconfirm ? { grantedOn: koreanDate(c.grantedAt) } : null,
      },
    },
  };
}

export async function handleSettingsPost(
  body: unknown,
  userId: string | null,
  deps: {
    setRevisitPref(userId: string, on: boolean): Promise<void>;
    setAdConsent?(userId: string, grant: boolean, source: string): Promise<SetConsentResult>;
    recordReconfirmNotice?(userId: string, source: "reconfirm_popup"): Promise<boolean>;
  },
): Promise<HandlerResult> {
  if (!userId) return UNAUTH;
  const b = obj(body);
  if ("ad" in b) {
    if (typeof b.ad !== "boolean") return { status: 400, body: { error: "bad_ad" } };
    if (typeof b.source !== "string" || !(USER_SOURCES as readonly string[]).includes(b.source)) {
      return { status: 400, body: { error: "bad_source" } };
    }
    if (!deps.setAdConsent) throw new Error("setAdConsent missing");
    const r = await deps.setAdConsent(userId, b.ad, b.source);
    if (!r.ok) throw new Error(`set ad consent: ${r.reason}`); // 표 없이 부르면 생길 수 없다
    return { status: 200, body: { status: r.status, notice: noticeOf(r) } };
  }
  if ("reconfirmSeen" in b) {
    if (b.reconfirmSeen !== true) return { status: 400, body: { error: "bad_reconfirm" } };
    if (!deps.recordReconfirmNotice) throw new Error("recordReconfirmNotice missing");
    await deps.recordReconfirmNotice(userId, "reconfirm_popup");
    return { status: 200, body: { ok: true } };
  }
  const { revisit } = b;
  if (typeof revisit !== "boolean") return { status: 400, body: { error: "bad_revisit" } };
  await deps.setRevisitPref(userId, revisit);
  return { status: 200, body: { ok: true } };
}

/** 수신거부 — 로그인 없이 표만 본다(§4-7). 위조·모양 틀림·없는 발송·광고 아닌 발송은 같게 403(존재 여부를 흘리지 않는다), 재사용은 409 */
export async function handleUnsubscribePost(
  body: unknown,
  deps: {
    sendOwner(sendId: number): Promise<{ userId: string; klass: "info" | "ad" } | null>;
    setAdConsent(userId: string, grant: false, source: "unsubscribe_button" | "unsubscribe_line", sendId: number): Promise<SetConsentResult>;
    secret?: string;
  },
): Promise<HandlerResult> {
  const { token, source } = obj(body);
  if (source !== "unsubscribe_button" && source !== "unsubscribe_line") return { status: 400, body: { error: "bad_source" } };
  const forbidden: HandlerResult = { status: 403, body: { error: "forbidden" } };
  const t = readUnsubToken(token);
  if (!t) return forbidden;
  const owner = await deps.sendOwner(t.sendId);
  if (!owner || owner.klass !== "ad" || !verifyUnsubToken(token as string, owner.userId, deps.secret)) return forbidden;
  const r = await deps.setAdConsent(owner.userId, false, source, t.sendId);
  if (!r.ok) return r.reason === "token_used" ? { status: 409, body: { error: "used" } } : forbidden;
  return { status: 200, body: { status: r.status, notice: noticeOf(r) } };
}
