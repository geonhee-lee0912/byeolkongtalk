import { test } from "node:test";
import assert from "node:assert/strict";
import { computeWrapMode } from "./claude.ts";
import { WRAP_THRESHOLDS } from "./tarot/constants.ts";

const t = WRAP_THRESHOLDS.two_card; // 7/3240/9/3640/12

test("two_card — 6번째 답은 이제 자유 구간(예전 자연 마무리선)", () => {
  assert.equal(computeWrapMode(6, 5000, t).mode, "free");
});

test("two_card — 7번째부터 정리 말투", () => {
  const r = computeWrapMode(7, 3300, t);
  assert.equal(r.mode, "converge");
  assert.equal(r.isLastConvergeTurn, false);
});

test("two_card — 8번째(자연 마무리선−1)는 마지막 수렴 턴", () => {
  const r = computeWrapMode(8, 3300, t);
  assert.equal(r.mode, "converge");
  assert.equal(r.isLastConvergeTurn, true);
});

test("two_card — 9번째 + 글자 충족이면 자연 마무리선", () => {
  const r = computeWrapMode(9, 3700, t);
  assert.equal(r.mode, "hardcap");
  assert.equal(r.absHardcap, false);
});

test("two_card — 12번째는 강제 종료선", () => {
  const r = computeWrapMode(12, 100, t);
  assert.equal(r.mode, "hardcap");
  assert.equal(r.absHardcap, true);
});
