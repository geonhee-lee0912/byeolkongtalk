import { test } from "node:test";
import assert from "node:assert/strict";
import { rolling7, quantile, computeBand, costCoverage, pickBandAxis, dailyValues, type DailyPnl } from "./band.ts";

const day = (bucket: string, revenueWon: number, adSpendWon: number, apiCostWon: number, costRows: number): DailyPnl =>
  ({ bucket, revenueWon, adSpendWon, apiCostWon, costRows });

test("rolling7 — 앞 6일은 창이 안 차므로 버린다", () => {
  assert.deepEqual(rolling7([1, 1, 1, 1, 1, 1, 1, 1]), [7, 7]); // 8일 입력 → 2개
  assert.deepEqual(rolling7([1, 2, 3]), []); // 7일 미만이면 빈 배열
});

test("quantile — 선형보간, 경계", () => {
  const s = [10, 20, 30, 40, 50];
  assert.equal(quantile(s, 0), 10);
  assert.equal(quantile(s, 1), 50);
  assert.equal(quantile(s, 0.5), 30);
  assert.equal(quantile(s, 0.25), 20);
});

test("computeBand — 현재값 위치와 범위 이탈", () => {
  const rolling = Array.from({ length: 56 }, (_, i) => i); // 0..55, 현재값 = 마지막 = 55
  const b = computeBand(rolling);
  assert.ok(b);
  assert.equal(b.current, 55);
  assert.ok(b.p10 < b.p90);
  assert.equal(b.outside, true); // 55 > p90
});

test("computeBand — 표본이 8개 미만이면 null (밴드를 그리지 않는다)", () => {
  assert.equal(computeBand([1, 2, 3]), null);
});

test("costCoverage — cost_rows 가 0 인 날은 '0원'이 아니라 '미축적'", () => {
  const days = [day("2026-09-19", 1000, 2000, 0, 0), day("2026-09-20", 1000, 2000, 50, 12)];
  const c = costCoverage(days);
  assert.equal(c.covered, 1);
  assert.equal(c.total, 2);
  assert.equal(c.full, false);
});

test("pickBandAxis — 원가가 창 전체를 덮어야 완전 기여 축", () => {
  const partial = [day("2026-09-19", 0, 0, 0, 0), day("2026-09-20", 0, 0, 50, 12)];
  assert.equal(pickBandAxis(partial), "marketing");
  const full = [day("2026-09-19", 0, 0, 10, 3), day("2026-09-20", 0, 0, 50, 12)];
  assert.equal(pickBandAxis(full), "contribution");
});

test("dailyValues — 축에 따라 원가를 빼거나 뺀다/안 뺀다", () => {
  const days = [day("2026-09-20", 10_000, 7_000, 500, 12)];
  assert.deepEqual(dailyValues(days, "marketing"), [3_000]);
  assert.deepEqual(dailyValues(days, "contribution"), [2_500]);
});
