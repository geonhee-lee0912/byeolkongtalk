import { test } from "node:test";
import assert from "node:assert/strict";
import {
  daysLeft,
  subscribePhase,
  subscriptionPurchaseDays,
  takeSubscribeResume,
  withSubscribeResume,
  SUBSCRIBE_RESUME_KEY,
} from "./subscribe-offer.ts";
import { computeEntitlement, TRIAL_DAYS } from "./entitlement.ts";
import { BYEOLMARU_SUBSCRIPTION } from "./constants.ts";

const NOW = new Date("2026-10-11T12:00:00Z");
const H = 3_600_000;
const iso = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

// ── 단계 ──
test("subscribePhase — 체험 전·체험 중·체험 후·구독 중", () => {
  assert.equal(subscribePhase({ entitled: false, trialUsed: false }), "pre_trial");
  assert.equal(subscribePhase({ entitled: true, trialUsed: true, trialEndsAt: iso(H), subscriptionExpiresAt: null }), "trial");
  assert.equal(subscribePhase({ entitled: false, trialUsed: true }), "post_trial");
  assert.equal(subscribePhase({ entitled: true, trialUsed: true, subscriptionExpiresAt: iso(10 * 24 * H) }), "subscribed");
});

// ── 구매 일수(Y) — 사용자 결정 10-11 "체험 중 구독의 30일 = 체험 끝난 뒤부터" ──
test("체험 전 = 30 + 체험 3일 = 33, 성공 뒤 체험 시작을 기록한다", () => {
  const r = subscriptionPurchaseDays({ entitled: false, trialUsed: false }, NOW);
  assert.deepEqual(r, { phase: "pre_trial", days: BYEOLMARU_SUBSCRIPTION.days + TRIAL_DAYS, recordTrial: true });
  assert.equal(r.days, 33);
});

test("체험 중 — 남은 시간 올림: 71.9h → 3일 · 0.1h → 1일 · 정확히 48h → 2일 · 48.1h → 3일", () => {
  const at = (hoursLeft: number) =>
    subscriptionPurchaseDays(
      { entitled: true, trialUsed: true, trialEndsAt: iso(hoursLeft * H), subscriptionExpiresAt: null },
      NOW
    );
  assert.deepEqual(at(71.9), { phase: "trial", days: 33, recordTrial: false });
  assert.equal(at(0.1).days, 31);
  assert.equal(at(48).days, 32);
  assert.equal(at(48.1).days, 33);
});

test("체험 중 판정 뒤 계산 전에 체험이 끝났으면 30일(음수 일수 없음)", () => {
  const r = subscriptionPurchaseDays(
    { entitled: true, trialUsed: true, trialEndsAt: iso(-0.01 * H), subscriptionExpiresAt: null },
    NOW
  );
  assert.equal(r.days, 30);
});

test("체험 후 = 30 · 기록 안 함", () => {
  assert.deepEqual(subscriptionPurchaseDays({ entitled: false, trialUsed: true }, NOW), {
    phase: "post_trial",
    days: 30,
    recordTrial: false,
  });
});

test("이미 구독 중 = 30 — RPC 가 활성 만료 뒤에 이어 붙인다(체험 기록 안 함)", () => {
  const r = subscriptionPurchaseDays(
    { entitled: true, trialUsed: true, trialEndsAt: null, subscriptionExpiresAt: iso(5 * 24 * H) },
    NOW
  );
  assert.deepEqual(r, { phase: "subscribed", days: 30, recordTrial: false });
});

// 라우트가 실제로 쓰는 경로 그대로 — DB 원본(체험 시작 시각) → computeEntitlement → 일수.
test("computeEntitlement 를 거쳐도 같다 — 체험 시작 0.1h 뒤 구매 = 33일, 71.9h 뒤 = 31일", () => {
  const started = (hoursAgo: number) => iso(-hoursAgo * H);
  const days = (hoursAgo: number) =>
    subscriptionPurchaseDays(
      computeEntitlement({ trialStartedAt: started(hoursAgo), subscriptionExpiresAt: null }, NOW),
      NOW
    ).days;
  assert.equal(days(0.1), 33); // 남은 71.9h
  assert.equal(days(71.9), 31); // 남은 0.1h
  assert.equal(days(73), 30); // 이미 만료 = 체험 후
});

// ── D-N ──
test("daysLeft — 올림·최소 1 (HubBanner 칩과 체험 넛지가 같은 잣대)", () => {
  assert.equal(daysLeft(iso(71.9 * H), NOW.getTime()), 3);
  assert.equal(daysLeft(iso(72 * H), NOW.getTime()), 3);
  assert.equal(daysLeft(iso(0.1 * H), NOW.getTime()), 1);
  assert.equal(daysLeft(iso(-H), NOW.getTime()), 1);
});

// ── 충전 후 재오픈 표시 ──
test("withSubscribeResume — 날짜·탭 쿼리는 그대로 두고 표시를 얹는다(이미 있던 표시는 덮어쓴다)", () => {
  assert.equal(withSubscribeResume("/byeolmaru", "", "banner"), `/byeolmaru?${SUBSCRIBE_RESUME_KEY}=banner`);
  assert.equal(
    withSubscribeResume("/byeolmaru/day", "?date=2026-10-11&tab=tarot", "report_end"),
    "/byeolmaru/day?date=2026-10-11&tab=tarot&bm_sub=report_end"
  );
  assert.equal(withSubscribeResume("/byeolmaru/day", "?bm_sub=cut&tab=woori", "kept_report"), "/byeolmaru/day?bm_sub=kept_report&tab=woori");
});

test("takeSubscribeResume — 읽고 빼되 나머지 쿼리는 지킨다", () => {
  assert.deepEqual(takeSubscribeResume("?tab=tarot"), { found: false, surface: null, rest: "?tab=tarot" });
  assert.deepEqual(takeSubscribeResume(""), { found: false, surface: null, rest: "" });
  assert.deepEqual(takeSubscribeResume("?date=2026-10-11&tab=tarot&bm_sub=cut"), {
    found: true,
    surface: "cut",
    rest: "?date=2026-10-11&tab=tarot",
  });
  assert.deepEqual(takeSubscribeResume("?bm_sub=banner"), { found: true, surface: "banner", rest: "" });
});

test("takeSubscribeResume — 모르는 값은 열지 않고 지우기만 한다", () => {
  assert.deepEqual(takeSubscribeResume("?bm_sub=evil&tab=saju"), { found: true, surface: null, rest: "?tab=saju" });
  assert.deepEqual(takeSubscribeResume("?bm_sub="), { found: true, surface: null, rest: "" });
});

test("왕복 — 얹은 표시를 그대로 다시 읽는다(RechargeSheet returnTo → 돌아온 화면)", () => {
  const back = withSubscribeResume("/byeolmaru/day", "?tab=woori", "cut");
  const search = back.slice(back.indexOf("?"));
  assert.deepEqual(takeSubscribeResume(search), { found: true, surface: "cut", rest: "?tab=woori" });
});
