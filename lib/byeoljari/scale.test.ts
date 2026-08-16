import { test } from "node:test";
import assert from "node:assert/strict";
import { scaleForCount } from "./scale.ts";

test("scaleForCount — 6명 이하는 기본(FEW) 크기 + 라벨 표시", () => {
  const s = scaleForCount(3);
  assert.equal(s.hostOuter, 6);
  assert.equal(s.starOuter, 4);
  assert.equal(s.lineWidth, 0.4);
  assert.equal(s.showLabels, true);
});

test("scaleForCount — 16명 이상은 MANY 크기 + 라벨 숨김", () => {
  const s = scaleForCount(16);
  assert.equal(s.hostOuter, 4.5);
  assert.equal(s.starOuter, 2.6);
  assert.equal(s.showLabels, false);
});

test("scaleForCount — 30명은 16명과 동일(클램프)", () => {
  assert.deepEqual(scaleForCount(30), scaleForCount(16));
});

test("scaleForCount — 11명은 중간 보간(t=0.5)", () => {
  const s = scaleForCount(11);
  assert.equal(s.hostOuter, 5.25); // 6 + (4.5-6)*0.5
  assert.equal(s.starOuter, 3.3); // 4 + (2.6-4)*0.5
  assert.equal(s.showLabels, false); // 11 > 8
});

test("scaleForCount — 인원 많을수록 별이 작아짐(단조)", () => {
  assert.ok(scaleForCount(20).starOuter < scaleForCount(6).starOuter);
});

test("scaleForCount — 라벨 임계는 8명", () => {
  assert.equal(scaleForCount(8).showLabels, true);
  assert.equal(scaleForCount(9).showLabels, false);
});
