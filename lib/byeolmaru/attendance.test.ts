import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStreak, ATTENDANCE_THRESHOLD, ATTENDANCE_REWARD_STARS } from "./attendance.ts";

test("오늘 포함 연속 3일이면 streak=3", () => {
  assert.equal(computeStreak(["2026-09-02", "2026-09-03", "2026-09-04"], "2026-09-04"), 3);
});
test("오늘 미출석이면 어제까지의 연속 run 을 센다(오늘 채우면 이어질 값)", () => {
  assert.equal(computeStreak(["2026-09-02", "2026-09-03"], "2026-09-04"), 2);
});
test("어제도 오늘도 없으면 0", () => {
  assert.equal(computeStreak(["2026-09-01"], "2026-09-04"), 0);
});
test("중간에 끊기면 최근 run 만", () => {
  assert.equal(computeStreak(["2026-08-30", "2026-09-03", "2026-09-04"], "2026-09-04"), 2);
});
test("빈 기록이면 0", () => {
  assert.equal(computeStreak([], "2026-09-04"), 0);
});
test("보상 상수 — 구독료(20)보다 작다(매출 붕괴 방지)", () => {
  assert.equal(ATTENDANCE_THRESHOLD, 20);
  assert.ok(ATTENDANCE_REWARD_STARS < 20, "보상은 구독료 미만");
});
