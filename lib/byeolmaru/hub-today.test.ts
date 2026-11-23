import { test } from "node:test";
import assert from "node:assert/strict";
import { hubTodayLines, hubSubscribeLine } from "./hub-today.ts";

test("hubTodayLines: 점수·하루 이름·날짜·연속", () => {
  assert.deepEqual(
    hubTodayLines({ today: "2026-11-21", todayName: "생각이 깊어지는 결", todayScore: 57, streak: 2 }),
    { title: "오늘 57점 · 생각이 깊어지는 결", sub: "11월 21일 (토) · 2일 연속 들르는 중" }
  );
});

test("hubTodayLines: 연속 1일 이하·없음은 날짜만 (TodayLead 와 같은 규칙)", () => {
  assert.equal(hubTodayLines({ today: "2026-11-02", todayName: "x", todayScore: 40, streak: 1 }).sub, "11월 2일 (월)");
  assert.equal(hubTodayLines({ today: "2026-11-02", todayName: "x", todayScore: 40, streak: null }).sub, "11월 2일 (월)");
});

test("hubTodayLines: 점수·이름이 없을 때", () => {
  assert.equal(hubTodayLines({ today: "2026-11-21", todayName: "결", todayScore: null, streak: null }).title, "오늘 · 결");
  assert.equal(hubTodayLines({ today: "2026-11-21", todayName: null, todayScore: null, streak: null }).title, "오늘의 흐름");
});

const NOW = Date.parse("2026-11-21T00:00:00Z");
const IN_12D = "2026-12-03T00:00:00Z";

test("hubSubscribeLine: 체험 전 = 체험 버튼", () => {
  const r = hubSubscribeLine({ entitled: false, trialUsed: false, subscriptionExpiresAt: null, trialEndsAt: null, now: NOW });
  assert.equal(r.action, "trial");
  assert.equal(r.chip, "3일 무료 체험");
  assert.equal(r.text, "3일 동안 사주·타로·우리를 끝까지 봐");
});

test("hubSubscribeLine: 체험 뒤 = 구독 버튼", () => {
  const r = hubSubscribeLine({ entitled: false, trialUsed: true, subscriptionExpiresAt: null, trialEndsAt: null, now: NOW });
  assert.equal(r.action, "subscribe");
  assert.equal(r.chip, "구독하기");
  assert.equal(r.text, "구독하면 사주·타로·우리를 끝까지 봐");
});

test("hubSubscribeLine: 구독 중·체험 중 = 누를 것 없는 D-n 칩 (HubBanner 와 같은 잣대)", () => {
  const sub = hubSubscribeLine({ entitled: true, trialUsed: true, subscriptionExpiresAt: IN_12D, trialEndsAt: null, now: NOW });
  assert.equal(sub.action, null);
  assert.equal(sub.chip, "구독 중 · D-12");
  assert.equal(sub.text, "사주·타로·우리를 끝까지 볼 수 있어");
  const trial = hubSubscribeLine({ entitled: true, trialUsed: true, subscriptionExpiresAt: null, trialEndsAt: IN_12D, now: NOW });
  assert.equal(trial.chip, "체험 중 · D-12");
  const noExpiry = hubSubscribeLine({ entitled: true, trialUsed: false, subscriptionExpiresAt: null, trialEndsAt: null, now: NOW });
  assert.equal(noExpiry.chip, "체험 중");
});
