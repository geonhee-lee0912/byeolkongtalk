// P5-2 무료선 계약 — 라우트가 조립하는 모양을 순수 함수로 재현해 "안 온 날이 안 샌다"를 고정한다.
// (라우트 자체는 DB·세션을 물어 유닛에서 못 돌린다 — 조립 규칙만 여기서 지킨다.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcSaju, calcDailyLuckRange } from "@/lib/saju/calc";
import { buildCalendar, monthRange, splitByFreeLine, weekBuckets } from "./calendar.ts";
import { buildPairCalendar } from "./pair-day.ts";

const TODAY = "2026-09-13";
const saju = calcSaju({ year: 1994, month: 5, day: 17, hour: 14, gender: "other", isLunar: false });
const partnerSaju = calcSaju({ year: 1992, month: 11, day: 3, hour: 21, gender: "other", isLunar: false });

function build(entitled: boolean) {
  const { start, end } = monthRange(TODAY);
  const all = buildCalendar(saju, calcDailyLuckRange(start, end), TODAY);
  const { open, lockedDates } = splitByFreeLine(all, TODAY, entitled);
  return { all, open, lockedDates, weeks: weekBuckets(open) };
}

// 우리(pair) 탭도 같은 조립 규칙(calendar.ts splitByFreeLine)을 타는지 별도로 고정한다 —
// self 재현만으로는 "두 탭이 같은 창을 쓴다"가 보장되지 않는다(pair 조립이 갈라져도 위 테스트는 안 깨진다).
function buildPair(entitled: boolean) {
  const { start, end } = monthRange(TODAY);
  const all = buildPairCalendar(saju, partnerSaju, calcDailyLuckRange(start, end), TODAY);
  const { open, lockedDates } = splitByFreeLine(all, TODAY, entitled);
  return { all, open, lockedDates };
}

test("이번 달 달력은 1일부터 말일까지 전부 계산된다", () => {
  const { all } = build(true);
  assert.equal(all.length, 30, "2026-09 는 30일");
  assert.equal(all[0].date, "2026-09-01");
  assert.equal(all[29].date, "2026-09-30");
  assert.equal(all.filter((c) => c.isToday).length, 1);
});

test("비자격자 응답엔 오늘 이후 셀이 하나도 없다(판정 누출 0)", () => {
  const { open, lockedDates } = build(false);
  assert.ok(open.every((c) => c.date <= TODAY), "열린 셀에 미래가 섞였다");
  assert.equal(open.length, 13, "9/1~9/13");
  assert.equal(lockedDates.length, 17, "9/14~9/30");
  assert.ok(lockedDates.every((d) => d > TODAY));
});

test("비자격자의 주차 요약도 오늘까지만 집계된다(good/caution 개수로 미래가 새지 않는다)", () => {
  const { weeks } = build(false);
  assert.ok(weeks.every((w) => w.endDate <= TODAY), "주차 버킷이 미래를 덮었다");
});

test("자격자는 이번 달 전부가 열리고 잠긴 날이 없다", () => {
  const { open, lockedDates } = build(true);
  assert.equal(open.length, 30);
  assert.deepEqual(lockedDates, []);
});

test("[우리] 자격자는 이번 달 전부가 열리고 잠긴 날이 없다", () => {
  const { open, lockedDates } = buildPair(true);
  assert.equal(open.length, 30);
  assert.deepEqual(lockedDates, []);
});

test("[우리] 비자격자 응답엔 오늘 이후 셀이 하나도 없다(판정 누출 0)", () => {
  const { open, lockedDates } = buildPair(false);
  assert.ok(open.every((c) => c.date <= TODAY), "열린 셀에 미래가 섞였다");
  assert.equal(open.length, 13, "9/1~9/13");
  assert.equal(lockedDates.length, 17, "9/14~9/30");
  assert.ok(lockedDates.every((d) => d > TODAY));
});

test("나 탭과 우리 탭의 무료선은 정확히 같은 날짜 집합을 연다", () => {
  const self = build(false);
  const pair = buildPair(false);
  assert.deepEqual(
    pair.open.map((c) => c.date),
    self.open.map((c) => c.date),
    "두 탭의 열린 날짜 집합이 다르다"
  );
  assert.deepEqual(pair.lockedDates, self.lockedDates, "두 탭의 잠긴 날짜 집합이 다르다");
});
