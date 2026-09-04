import { test } from "node:test";
import assert from "node:assert/strict";
import { pickCrossSell } from "./crosssell.ts";
import type { DayCell } from "./calendar.ts";

function cell(love: number, money: number, work: number): DayCell {
  return { date: "2026-09-04", ganji: "辛巳", element: "금",
    grade: { label: "무난한 날", tone: "normal" }, axes: { love, money, work },
    score: 60, isToday: true } as unknown as DayCell;
}

test("연애 축이 최고면 타로 추천", () => {
  const r = pickCrossSell(cell(80, 40, 30));
  assert.equal(r.product, "tarot");
  assert.equal(r.href, "/");
});
test("연애가 최고가 아니면 사주 리포트", () => {
  const r = pickCrossSell(cell(20, 70, 40));
  assert.equal(r.product, "saju_report");
  assert.equal(r.href, "/fortune");
});
test("항상 title·desc 가 채워진다", () => {
  const r = pickCrossSell(cell(50, 50, 50));
  assert.ok(r.title.length > 0 && r.desc.length > 0);
});
