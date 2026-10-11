// lib/byeolmaru/subscribe-offer.ts — 별마루 구독 선택지의 '단계' · 구매 일수 · 충전 후 재오픈 표시.
// 🔴 클라이언트 세이프 순수 함수만 둔다(constants.ts 와 같은 이유 — entitlement.ts·subscription.ts 는
//    getServiceSupabase 를 물고 있다). 구독 라우트(일수)와 화면(확인창 문구·계측)이 **같은 단계 판정**을 쓴다.
// 스펙: docs/superpowers/specs/2026-10-11-별마루-체험중-구독노출-design.md §3
import { BYEOLMARU_SUBSCRIPTION, TRIAL_DAYS } from "./constants";

/** 구독 선택지를 본·누른 순간의 단계 — 계측 meta.phase 값 그대로다. */
export type SubscribePhase = "pre_trial" | "trial" | "post_trial" | "subscribed";

/** 구독 선택지가 그려지는 자리 — 계측 meta.surface 이자 충전 후 재오픈 표시(bm_sub)의 값. */
export const SUBSCRIBE_SURFACES = ["cut", "report_end", "banner", "kept_report"] as const;
export type SubscribeSurface = (typeof SUBSCRIBE_SURFACES)[number];

/** 자격 스냅샷 — 캘린더 응답과 computeEntitlement 결과가 둘 다 이 모양이다. */
export interface EntitlementSnapshot {
  entitled: boolean;
  trialUsed: boolean;
  trialEndsAt?: string | null;
  subscriptionExpiresAt?: string | null;
}

export function subscribePhase(e: EntitlementSnapshot): SubscribePhase {
  // 자격자인데 구독 만료가 없으면 체험이다 — computeEntitlement 가 구독을 먼저 보므로(구독 우선)
  // 체험 중에 산 사람은 그 순간부터 subscribed 다.
  if (e.entitled) return e.subscriptionExpiresAt ? "subscribed" : "trial";
  return e.trialUsed ? "post_trial" : "pre_trial";
}

/** 남은 일수(D-N) — HubBanner 칩과 체험 넛지가 같이 쓴다. 한 화면에서 두 숫자가 갈리면 안 된다.
 *  만료 판정이 타임스탬프 비교라 그쪽과 잣대를 맞춰 24h 블록 기준 올림이고, 최소 1이다
 *  (자격이 있다는 건 만료가 미래라는 뜻 — D-0 은 "오늘 끝"으로 읽혀 혼동된다). */
export function daysLeft(iso: string, now: number): number {
  return Math.max(1, Math.ceil((new Date(iso).getTime() - now) / 86_400_000));
}

/**
 * 이번 구매의 p_days(`purchase_byeolmaru_subscription`) — 사용자 결정(2026-10-11):
 * "체험 중 구독의 30일은 체험이 끝난 뒤부터, 체험 전에 사면 체험 3일 + 30일".
 * 🔴 RPC 는 `GREATEST(활성 구독 만료, now()) + p_days` 라 **체험을 모른다**(체험은 구독 행이 아니다).
 *    그래서 남은 체험을 여기서 일수에 더하고 SQL 은 그대로 둔다.
 * - 체험 전: 30 + 3, 성공 뒤 체험 시작을 기록한다(recordTrial) — 안 하면 33일 뒤 '3일 무료 체험'이 다시 뜬다
 * - 체험 중: 30 + 남은 체험(시간 기준 올림 — 71.9h → 3일 · 0.1h → 1일, 남는 몇 시간은 유저 몫)
 * - 체험 후: 30
 * - 구독 중: 라우트가 이 함수 **전에** 409 로 막는다(alreadySubscribedUntil, 2026-10-12) — 여기 값(30)은 방어값이다
 */
export function subscriptionPurchaseDays(
  e: EntitlementSnapshot,
  now: Date
): { phase: SubscribePhase; days: number; recordTrial: boolean } {
  const base = BYEOLMARU_SUBSCRIPTION.days;
  const phase = subscribePhase(e);
  if (phase === "pre_trial") return { phase, days: base + TRIAL_DAYS, recordTrial: true };
  if (phase === "trial" && e.trialEndsAt) {
    const left = Math.ceil((new Date(e.trialEndsAt).getTime() - now.getTime()) / 86_400_000);
    // 자격 판정과 이 계산 사이에 체험이 끝났으면 0 — 체험 후와 같은 30일이 된다
    return { phase, days: base + Math.max(0, left), recordTrial: false };
  }
  return { phase, days: base, recordTrial: false };
}

/**
 * 이미 구독 중이면 사지 않는다 — 구독 라우트가 차감 없이 409 `already_subscribed` 로 돌려준다(사용자 결정 2026-10-12).
 * 돌려주는 값 = 지금 구독의 만료(안내 "M월 D일까지"용) · 구독 중이 아니면 null(산다).
 * 🔴 구독자 화면엔 연장 버튼이 없다 — 구독 중 구매는 사실상 전부 **낡은 화면**(다른 탭에서 막 산 뒤 남은 버튼)에서 온다.
 *    예전엔 RPC 가 30일을 이어 붙이고 20별을 또 뺐다. 순차 중복(앞 요청이 커밋된 뒤 도착)도 여기서 막힌다 —
 *    남는 건 두 기기 '동시' 구매뿐이다(둘 다 커밋 전에 자격을 읽는다 — 스펙 §4-1, 판독 SQL 이 감시).
 */
export function alreadySubscribedUntil(e: EntitlementSnapshot): string | null {
  return subscribePhase(e) === "subscribed" ? e.subscriptionExpiresAt ?? null : null;
}

/** 409 안내 — "이미 구독 중이야 — M월 D일까지"(만료의 KST 날짜). 만료를 모르면 날짜 없이. */
export function alreadySubscribedNotice(expiresAt: string | null | undefined): string {
  const t = expiresAt ? Date.parse(expiresAt) : NaN;
  if (Number.isNaN(t)) return "이미 구독 중이야";
  const kst = new Date(t + 9 * 3_600_000);
  return `이미 구독 중이야 — ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일까지`;
}

/** 체험 시작·구독 요청과, 그 뒤 날짜 상세 껍데기의 자격 다시 받기의 시간 제한. 처리 중엔 구독 확인창을 못 닫아서
 *  응답이 영영 안 오면 갇힌다 — 시간이 지나면 잠금을 풀고 '결과를 모른다'로 다룬다(화면을 새로 읽는다). */
export const BYEOLMARU_REQUEST_TIMEOUT_MS = 15_000;

/** 별마루 자격이 바뀌었을 수 있다 — useByeolmaruSubscribe 가 체험·구독의 성공·409·실패·시간 초과 뒤 window 에 보낸다.
 *  같은 화면에서 자격 스냅샷을 든 곳(날짜 상세 껍데기 DayTabsView)이 듣고 캘린더를 다시 받아 열린 탭 전부에 내려준다. */
export const ENTITLEMENT_CHANGED_EVENT = "byeolmaru:entitlement-changed";

/** 충전하고 돌아와 구독 확인창을 다시 여는가 — 잔액이 구독 가격 이상일 때만(사용자 결정 2026-10-12).
 *  결제 실패·취소 뒤 '← 대화로 돌아가기'도 returnTo(표시 포함)로 오는데, 그때 열면 같은 '별이 부족해' 창이 또 뜬다.
 *  잔액을 못 읽었으면(null) 열지 않는다. 이미 구독 중이면 안 연다(다른 탭에서 샀을 수 있다). */
export function shouldResumeSubscribe(phase: SubscribePhase, balance: number | null): boolean {
  return phase !== "subscribed" && balance !== null && balance >= BYEOLMARU_SUBSCRIPTION.cost;
}

/** 충전하고 돌아오면 구독 확인창을 다시 연다 — RechargeSheet returnTo 에 실어 보내는 표시 키. */
export const SUBSCRIBE_RESUME_KEY = "bm_sub";

export function isSubscribeSurface(v: unknown): v is SubscribeSurface {
  return typeof v === "string" && (SUBSCRIBE_SURFACES as readonly string[]).includes(v);
}

/** returnTo — 지금 주소(경로 + 쿼리)에 표시를 얹는다. 날짜·탭 같은 기존 쿼리는 그대로, 이미 있던 표시는 덮어쓴다. */
export function withSubscribeResume(pathname: string, search: string, surface: SubscribeSurface): string {
  const params = new URLSearchParams(search);
  params.set(SUBSCRIBE_RESUME_KEY, surface);
  return `${pathname}?${params.toString()}`;
}

/** 돌아온 주소에서 표시를 읽고 뺀다. found=false 면 주소를 건드릴 필요가 없다.
 *  found=true 인데 surface=null 이면 모르는 값(손으로 친 주소 등) — 열지 않고 지우기만 한다.
 *  rest = 표시를 뺀 쿼리("?…" 또는 ""). */
export function takeSubscribeResume(search: string): {
  found: boolean;
  surface: SubscribeSurface | null;
  rest: string;
} {
  const params = new URLSearchParams(search);
  if (!params.has(SUBSCRIBE_RESUME_KEY)) return { found: false, surface: null, rest: search };
  const raw = params.get(SUBSCRIBE_RESUME_KEY);
  params.delete(SUBSCRIBE_RESUME_KEY);
  const qs = params.toString();
  return { found: true, surface: isSubscribeSurface(raw) ? raw : null, rest: qs ? `?${qs}` : "" };
}
