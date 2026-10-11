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
 * - 구독 중: 30 — RPC 가 활성 만료 뒤에 이어 붙인다
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
