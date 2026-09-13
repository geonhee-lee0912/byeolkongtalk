import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStreak, type AttendanceState } from "./attendance.ts";

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
test("AttendanceState 는 보상 필드를 갖지 않는다(환급 폐지 — 보상은 그날의 운세다)", () => {
  // 타입 레벨 계약이라 런타임 단언이 아니라 tsc 가 지킨다. 아래 객체에 daysThisSub 나 threshold 를
  // 되살리면 초과 속성으로 컴파일이 막힌다 — 폐지가 조용히 되돌아오는 걸 막는 문지기.
  const s: AttendanceState = { checkedInToday: true, streak: 3 };
  assert.equal(s.streak, 3);
});
