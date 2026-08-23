import { test } from "node:test";
import assert from "node:assert/strict";
import { scaleForCount } from "./scale.ts";

test("scaleForCount — 크기·선 두께는 인원 무관 고정", () => {
  const few = scaleForCount(3);
  const many = scaleForCount(20);
  assert.equal(few.starOuter, 4.0);
  assert.equal(few.hostOuter, 3.8);
  assert.equal(few.lineWidth, 0.7);
  // showLabels 외 전부 동일(인원 무관 고정)
  assert.deepEqual({ ...few, showLabels: null }, { ...many, showLabels: null });
});

test("scaleForCount — 라벨은 20명까지 표시, 21명↑ 숨김(방어)", () => {
  assert.equal(scaleForCount(20).showLabels, true);
  assert.equal(scaleForCount(21).showLabels, false);
});
