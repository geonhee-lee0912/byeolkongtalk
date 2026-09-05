import { test } from "node:test";
import assert from "node:assert/strict";
import { calcSaju, calcTemporalLuck, baseDateForKst } from "@/lib/saju/calc";
import { pairBackdrop, buildPairCalendar } from "./pair-day.ts";
import { buildTeaserLine, buildPairNarrativeSystem, PAIR_NARRATIVE_KICKOFF } from "./narrative-prompt.ts";
import type { DayCell } from "./calendar.ts";

const CELL = {
  date: "2026-09-04", ganji: "辛巳", element: "금",
  grade: { label: "아주 좋은 날", tone: "good" }, axes: { love: 63, money: 40, work: 55 },
  score: 70, isToday: true,
} as unknown as DayCell;

test("buildTeaserLine — 정적 첫 줄이 비지 않고 반말·별콩이 톤", () => {
  const line = buildTeaserLine(CELL);
  assert.equal(typeof line, "string");
  assert.ok(line.length > 10);
  assert.ok(!/입니다|습니다/.test(line));
});

test("buildPairNarrativeSystem: 두 사람·너희 결·오늘 신호 + 마커금지 규칙", () => {
  const a = calcSaju({ year: 1996, month: 4, day: 11, hour: 9, gender: "female", isLunar: false, isLeapMonth: false });
  const b = calcSaju({ year: 1994, month: 11, day: 3, hour: 21, gender: "male", isLunar: false, isLeapMonth: false });
  const t = calcTemporalLuck(baseDateForKst("2026-09-05"), 1996, { includeMonth: true });
  const cell = buildPairCalendar(a, b, t.dailyLuck!, "2026-09-05")[0];
  const bd = pairBackdrop(a, b);
  const sys = buildPairNarrativeSystem(a, b, bd, cell, "임오", "지우");
  assert.ok(sys.includes("우리 오늘"));
  assert.ok(sys.includes("지우"));
  assert.ok(sys.includes(bd.labelAtoB));
  assert.ok(/반말/.test(sys) && /단정/.test(sys) && /마커 없이|줄글만/.test(sys));
  assert.ok(PAIR_NARRATIVE_KICKOFF.length > 0);
});
