import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTeaserLine } from "./narrative-prompt.ts";
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
