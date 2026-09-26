// 전면 무료 계약 — 라우트(app/api/byeolmaru/calendar/route.ts)가 실제로 호출하는 함수를 그대로
// 불러 "자격과 무관하게 이번 달 전체가 나온다"를 코드 경로에 묶는다.
// 🔴 옛 free-line.test.ts(무료선 = 비자격자에게 미래를 안 싣는다)를 대체한다. 그 개념은
//    2026-09-26 에 폐지됐다 — 달력 칸은 룰 계산이라 변동비 0인데 잠겨 있었다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcSaju, calcDailyLuckRange } from "@/lib/saju/calc";
import { buildCalendarPayload, monthRange } from "./calendar.ts";
import { buildPairCalendar } from "./pair-day.ts";

const TODAY = "2026-09-13";
const saju = calcSaju({ year: 1994, month: 5, day: 17, hour: 14, gender: "other", isLunar: false });
const partnerSaju = calcSaju({ year: 1992, month: 11, day: 3, hour: 21, gender: "other", isLunar: false });

function build() {
  const { start, end } = monthRange(TODAY);
  return buildCalendarPayload(saju, calcDailyLuckRange(start, end), TODAY);
}

test("이번 달 달력은 1일부터 말일까지 전부 계산된다", () => {
  const { cells } = build();
  assert.equal(cells.length, 30, "2026-09 는 30일");
  assert.equal(cells[0].date, "2026-09-01");
  assert.equal(cells[29].date, "2026-09-30");
  assert.equal(cells.filter((c) => c.isToday).length, 1);
});

test("미래 날짜도 판정이 실린다(전면 무료 — 잠긴 칸 개념이 없다)", () => {
  const { cells } = build();
  const future = cells.filter((c) => c.date > TODAY);
  assert.equal(future.length, 17, "9/14~9/30");
  assert.ok(future.every((c) => typeof c.score === "number" && c.grade != null));
});

test("주차 요약도 이번 달 전체를 집계한다", () => {
  const { weeks } = build();
  assert.equal(weeks[0].startDate, "2026-09-01");
  assert.equal(weeks[weeks.length - 1].endDate, "2026-09-30");
});

test("[우리] pair 달력도 이번 달 전부가 판정과 함께 나온다", () => {
  const { start, end } = monthRange(TODAY);
  const all = buildPairCalendar(saju, partnerSaju, calcDailyLuckRange(start, end), TODAY);
  assert.equal(all.length, 30);
  assert.ok(all.every((c) => c.tone != null));
});
