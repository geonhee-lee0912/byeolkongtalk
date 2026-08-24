import { test } from "node:test";
import assert from "node:assert/strict";
import { pentagonGeometry } from "./pentagon.ts";

test("pentagon — 5꼭지·목화토금수 순·최상단 시작", () => {
  const g = pentagonGeometry({ 목: 2, 화: 1, 토: 2, 금: 1, 수: 2 }, 200);
  assert.equal(g.axes.length, 5);
  assert.deepEqual(g.axes.map((a) => a.element), ["목", "화", "토", "금", "수"]);
  assert.ok(Math.abs(g.axes[0].x - 100) < 0.5, "첫 꼭지 상단(x≈cx)");
  assert.ok(g.axes[0].y < 100, "첫 꼭지 상단(y<cy)");
});

test("pentagon — 최대 오행이 외곽 반지름", () => {
  const g = pentagonGeometry({ 목: 8, 화: 0, 토: 0, 금: 0, 수: 0 }, 200);
  const d = Math.hypot(g.axes[0].x - g.cx, g.axes[0].y - g.cy);
  assert.ok(Math.abs(d - g.r) < 0.5, "최대값 꼭지가 r");
});

test("pentagon — 전부 0 이면 전 꼭지 중심(방어)", () => {
  const g = pentagonGeometry({ 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 }, 200);
  for (const a of g.axes) assert.ok(Math.hypot(a.x - g.cx, a.y - g.cy) < 0.5);
});
