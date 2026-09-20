// P5-2 무료선 계약 — 라우트(app/api/byeolmaru/calendar/route.ts)가 **실제로 호출하는 함수**를
// 그대로 불러 "안 온 날이 안 샌다"를 실제 코드 경로에 묶는다.
// self 는 buildCalendarPayload(calendar.ts) — 라우트의 self 분기가 부르는 바로 그 함수를 직접
// 호출한다. pair 는 라우트와 동일하게 buildPairCalendar → splitByFreeLine 을 그대로 잇는다
// (splitByFreeLine 자체가 self·pair 공유 지점이라 이미 실제 경로 — 단일 호출부인 pair 쪽에
// 전용 래퍼를 새로 두면 이 저장소 관례(단일 사용처 비-추상화)에 어긋난다).
// 🔴 그래도 안 덮이는 것: 라우트의 프로필/엔타이틀먼트/watch DB 조회, 세션 인증, 404/500 분기 —
//    라우트 자체는 DB·세션을 물어 유닛에서 못 돌린다(조립 이후 로직만 여기서 고정한다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcSaju, calcDailyLuckRange } from "@/lib/saju/calc";
import { buildCalendarPayload, monthRange, splitByFreeLine } from "./calendar.ts";
import { buildPairCalendar } from "./pair-day.ts";

const TODAY = "2026-09-13";
const saju = calcSaju({ year: 1994, month: 5, day: 17, hour: 14, gender: "other", isLunar: false });
const partnerSaju = calcSaju({ year: 1992, month: 11, day: 3, hour: 21, gender: "other", isLunar: false });

function build(entitled: boolean) {
  const { start, end } = monthRange(TODAY);
  return buildCalendarPayload(saju, calcDailyLuckRange(start, end), TODAY, entitled);
}

// 우리(pair) 탭도 같은 조립 규칙(calendar.ts splitByFreeLine)을 타는지 별도로 고정한다 —
// self 재현만으로는 "두 탭이 같은 창을 쓴다"가 보장되지 않는다(pair 조립이 갈라져도 위 테스트는 안 깨진다).
function buildPair(entitled: boolean) {
  const { start, end } = monthRange(TODAY);
  const all = buildPairCalendar(saju, partnerSaju, calcDailyLuckRange(start, end), TODAY);
  const { open, lockedCells } = splitByFreeLine(all, TODAY, entitled);
  return { all, open, lockedCells };
}

test("이번 달 달력은 1일부터 말일까지 전부 계산된다", () => {
  const { cells } = build(true);
  assert.equal(cells.length, 30, "2026-09 는 30일");
  assert.equal(cells[0].date, "2026-09-01");
  assert.equal(cells[29].date, "2026-09-30");
  assert.equal(cells.filter((c) => c.isToday).length, 1);
});

test("비자격자 응답엔 오늘 이후 셀이 하나도 없다(판정 누출 0)", () => {
  const { cells, lockedCells } = build(false);
  assert.ok(cells.every((c) => c.date <= TODAY), "열린 셀에 미래가 섞였다");
  assert.equal(cells.length, 13, "9/1~9/13");
  assert.equal(lockedCells.length, 17, "9/14~9/30");
  assert.ok(lockedCells.map((c) => c.date).every((d) => d > TODAY));
});

test("비자격자의 주차 요약도 오늘까지만 집계된다(good/caution 개수로 미래가 새지 않는다)", () => {
  const { weeks } = build(false);
  assert.ok(weeks.every((w) => w.endDate <= TODAY), "주차 버킷이 미래를 덮었다");
});

test("자격자는 이번 달 전부가 열리고 잠긴 날이 없다", () => {
  const { cells, lockedCells } = build(true);
  assert.equal(cells.length, 30);
  assert.deepEqual(lockedCells, []);
});

test("[우리] 자격자는 이번 달 전부가 열리고 잠긴 날이 없다", () => {
  const { open, lockedCells } = buildPair(true);
  assert.equal(open.length, 30);
  assert.deepEqual(lockedCells, []);
});

test("[우리] 비자격자 응답엔 오늘 이후 셀이 하나도 없다(판정 누출 0)", () => {
  const { open, lockedCells } = buildPair(false);
  assert.ok(open.every((c) => c.date <= TODAY), "열린 셀에 미래가 섞였다");
  assert.equal(open.length, 13, "9/1~9/13");
  assert.equal(lockedCells.length, 17, "9/14~9/30");
  assert.ok(lockedCells.map((c) => c.date).every((d) => d > TODAY));
});

test("나 탭과 우리 탭의 무료선은 정확히 같은 날짜 집합을 연다", () => {
  const self = build(false);
  const pair = buildPair(false);
  assert.deepEqual(
    pair.open.map((c) => c.date),
    self.cells.map((c) => c.date),
    "두 탭의 열린 날짜 집합이 다르다"
  );
  assert.deepEqual(
    pair.lockedCells.map((c) => c.date),
    self.lockedCells.map((c) => c.date),
    "두 탭의 잠긴 날짜 집합이 다르다"
  );
});

test("잠긴 칸은 간지를 싣고 판정은 안 싣는다", () => {
  const saju = calcSaju({ year: 1994, month: 5, day: 12, hour: 9, gender: "female", isLunar: false, isLeapMonth: false });
  const luck = calcDailyLuckRange("2026-09-01", "2026-09-30");
  const { cells, lockedCells } = buildCalendarPayload(saju, luck, "2026-09-10", false);

  assert.ok(lockedCells.length > 0, "비자격이면 안 온 날이 있어야 한다");
  for (const lc of lockedCells) {
    assert.match(lc.ganji, /^[가-힣]{2}$/, "간지 2자가 실려야 일지 캐릭터를 그린다");
    // 🔴 판정이 새지 않는지 — 키 존재를 직접 확인한다(타입만 믿으면 런타임에 뭐가 실렸는지 모른다).
    assert.deepEqual(Object.keys(lc).sort(), ["date", "ganji"]);
  }
  assert.ok(cells.every((c) => c.date <= "2026-09-10"));
});

test("자격자는 잠긴 칸이 0", () => {
  const saju = calcSaju({ year: 1994, month: 5, day: 12, hour: 9, gender: "female", isLunar: false, isLeapMonth: false });
  const luck = calcDailyLuckRange("2026-09-01", "2026-09-30");
  const { lockedCells } = buildCalendarPayload(saju, luck, "2026-09-10", true);
  assert.equal(lockedCells.length, 0);
});
