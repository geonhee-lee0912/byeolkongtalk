import { test } from "node:test";
import assert from "node:assert/strict";
import { scaleForCount } from "./scale.ts";

test("scaleForCount — 6명 이하는 기본(FEW) 크기 + 라벨 표시", () => {
  const s = scaleForCount(3);
  assert.equal(s.hostOuter, 6.8);
  assert.equal(s.starOuter, 4.6);
  assert.equal(s.lineWidth, 0.4);
  assert.equal(s.showLabels, true);
});

test("scaleForCount — 16명 이상은 MANY 크기(라벨은 20명까지 유지)", () => {
  const s = scaleForCount(16);
  assert.equal(s.hostOuter, 5.2);
  assert.equal(s.starOuter, 3);
  assert.equal(s.showLabels, true); // 16 <= 20
});

test("scaleForCount — 30명은 16명과 크기 동일(클램프), 라벨은 숨김(21명↑)", () => {
  const s16 = scaleForCount(16);
  const s30 = scaleForCount(30);
  assert.equal(s30.hostOuter, s16.hostOuter);
  assert.equal(s30.starOuter, s16.starOuter);
  assert.equal(s30.showLabels, false);
});

test("scaleForCount — 11명은 중간 보간(t=0.5)", () => {
  const s = scaleForCount(11);
  assert.equal(s.hostOuter, 6.0); // 6.8 + (5.2-6.8)*0.5
  assert.equal(s.starOuter, 3.8); // 4.6 + (3.0-4.6)*0.5
  assert.equal(s.showLabels, true); // 11 <= 20
});

test("scaleForCount — 인원 많을수록 별이 작아짐(단조)", () => {
  assert.ok(scaleForCount(20).starOuter < scaleForCount(6).starOuter);
});

test("scaleForCount — 라벨 임계는 20명", () => {
  assert.equal(scaleForCount(20).showLabels, true);
  assert.equal(scaleForCount(21).showLabels, false);
});
