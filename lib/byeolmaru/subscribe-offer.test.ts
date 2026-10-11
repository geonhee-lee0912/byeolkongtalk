import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alreadySubscribedNotice,
  alreadySubscribedUntil,
  daysLeft,
  shouldResumeSubscribe,
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

test("구독 중 = 30(방어값) — 라우트는 그 전에 409 로 막아 실제론 여기 안 온다(alreadySubscribedUntil)", () => {
  const r = subscriptionPurchaseDays(
    { entitled: true, trialUsed: true, trialEndsAt: null, subscriptionExpiresAt: iso(5 * 24 * H) },
    NOW
  );
  assert.deepEqual(r, { phase: "subscribed", days: 30, recordTrial: false });
});

// ── 구독 중 구매 막기(409 already_subscribed) — 사용자 결정 10-12 ──
// 구독자 화면엔 연장 버튼이 없다 → 구독 중 구매는 낡은 화면(다른 탭에서 막 산 뒤 남은 버튼)에서만 온다.
test("alreadySubscribedUntil — 구독 중이면 지금 구독의 만료, 체험 전·중·후는 null(산다)", () => {
  const exp = iso(10 * 24 * H);
  assert.equal(alreadySubscribedUntil({ entitled: true, trialUsed: true, trialEndsAt: null, subscriptionExpiresAt: exp }), exp);
  assert.equal(alreadySubscribedUntil({ entitled: false, trialUsed: false }), null);
  assert.equal(
    alreadySubscribedUntil({ entitled: true, trialUsed: true, trialEndsAt: iso(H), subscriptionExpiresAt: null }),
    null
  );
  assert.equal(alreadySubscribedUntil({ entitled: false, trialUsed: true }), null);
});

// 라우트가 실제로 쓰는 경로 그대로 — DB 원본(체험 시작·구독 만료) → computeEntitlement → 판정.
test("alreadySubscribedUntil — computeEntitlement 를 거쳐도: 활성 구독이면 막고, 만료된 구독이면 산다", () => {
  // 체험 중에 산 사람(체험 기록 + 활성 구독 행) — 구독이 우선이라 막힌다(두 번째 탭의 남은 버튼)
  const trialBuyer = computeEntitlement({ trialStartedAt: iso(-H), subscriptionExpiresAt: iso(33 * 24 * H) }, NOW);
  assert.equal(alreadySubscribedUntil(trialBuyer), iso(33 * 24 * H));
  // 체험 전에 산 사람(구독 직후 체험 기록이 수 초 차로 생긴다)
  const preTrialBuyer = computeEntitlement({ trialStartedAt: iso(0), subscriptionExpiresAt: iso(33 * 24 * H) }, NOW);
  assert.equal(alreadySubscribedUntil(preTrialBuyer), iso(33 * 24 * H));
  // 구독이 끝났다 = 체험 후 — 다시 산다(30일)
  const lapsed = computeEntitlement({ trialStartedAt: iso(-40 * 24 * H), subscriptionExpiresAt: iso(-H) }, NOW);
  assert.equal(alreadySubscribedUntil(lapsed), null);
  assert.equal(subscriptionPurchaseDays(lapsed, NOW).days, 30);
});

test("alreadySubscribedNotice — 만료를 KST 날짜로 'M월 D일까지', 모르면 날짜 없이", () => {
  assert.equal(alreadySubscribedNotice("2026-11-09T15:00:00Z"), "이미 구독 중이야 — 11월 10일까지"); // KST 11-10 00:00
  assert.equal(alreadySubscribedNotice("2026-11-09T14:59:59Z"), "이미 구독 중이야 — 11월 9일까지"); // KST 11-09 23:59
  assert.equal(alreadySubscribedNotice("2026-12-31T16:00:00Z"), "이미 구독 중이야 — 1월 1일까지"); // 해 넘김
  assert.equal(alreadySubscribedNotice(null), "이미 구독 중이야");
  assert.equal(alreadySubscribedNotice(undefined), "이미 구독 중이야");
  assert.equal(alreadySubscribedNotice("not-a-date"), "이미 구독 중이야");
});

// ── 충전 후 재오픈은 '충전하고 돌아왔을 때'만 — 사용자 결정 10-12 ──
// 결제 실패·취소 뒤 '← 대화로 돌아가기'도 returnTo(bm_sub 표시)로 온다 — 잔액이 그대로라 열면 같은 '부족' 창이다.
test("shouldResumeSubscribe — 잔액이 구독 가격 이상일 때만 다시 연다", () => {
  const cost = BYEOLMARU_SUBSCRIPTION.cost;
  assert.equal(shouldResumeSubscribe("post_trial", cost), true);
  assert.equal(shouldResumeSubscribe("pre_trial", cost + 100), true);
  assert.equal(shouldResumeSubscribe("trial", cost), true);
  assert.equal(shouldResumeSubscribe("post_trial", cost - 1), false); // 결제 실패·취소로 돌아왔다
  assert.equal(shouldResumeSubscribe("pre_trial", 0), false);
  assert.equal(shouldResumeSubscribe("post_trial", null), false); // 잔액을 못 읽었다 — 열지 않는다
});

test("shouldResumeSubscribe — 이미 구독 중이면 잔액과 무관하게 안 연다(다른 탭에서 샀다)", () => {
  assert.equal(shouldResumeSubscribe("subscribed", 500), false);
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
