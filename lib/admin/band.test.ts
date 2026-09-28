import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rolling7,
  quantile,
  computeBand,
  costCoverage,
  pickBandAxis,
  dailyValues,
  adSpendStaleDays,
  type DailyPnl,
} from "./band.ts";

// 🔴 DailyPnl 에 adRows 가 추가되며 헬퍼가 5인자 → 6인자로 바뀐다(플랜B Task 6). 순서는
// DailyPnl 필드 순서(adSpendWon 다음)를 따른다. 광고비 관련 없는 테스트는 adRows=1(= 입력됨)로
// 일관되게 채운다 — 값 자체는 그 테스트들의 판정에 관여하지 않는다.
const day = (
  bucket: string,
  revenueWon: number,
  adSpendWon: number,
  adRows: number,
  apiCostWon: number,
  costRows: number
): DailyPnl => ({ bucket, revenueWon, adSpendWon, adRows, apiCostWon, costRows });

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

test("computeBand — 표본 8개는 통과, 7개는 null (경계)", () => {
  assert.ok(computeBand([1, 2, 3, 4, 5, 6, 7, 8]) !== null);
  assert.equal(computeBand([1, 2, 3, 4, 5, 6, 7]), null);
});

test("computeBand — 값이 전부 같으면 flat (분포에 폭이 없다)", () => {
  const b = computeBand(Array.from({ length: 56 }, () => 0));
  assert.ok(b);
  assert.equal(b.flat, true);
  assert.equal(b.outside, false);
  assert.equal(b.pctRank, 100); // 이 조합이 화면에서 오해를 부르므로 flat 으로 구분한다
});

test("computeBand — 중간 80% 가 같아도 꼬리가 다르면 flat 이 아니다 (진짜 이상치를 가리지 않는다)", () => {
  // 과거 저점 1 + 오늘 고점 1, 나머지 54개 동일 — p10 === p90 이지만 전부 같지는 않다.
  const b = computeBand([50, ...Array(54).fill(100), 200]);
  assert.ok(b);
  assert.equal(b.p10, b.p90); // 중간 80% 는 동일
  assert.equal(b.flat, false); // 🔴 그래도 flat 이 아니다
  assert.equal(b.outside, true); // 오늘은 진짜 범위 밖 — 이 경고가 살아 있어야 한다
});

test("costCoverage — cost_rows 가 0 인 날은 '0원'이 아니라 '미축적'", () => {
  const days = [day("2026-09-19", 1000, 2000, 1, 0, 0), day("2026-09-20", 1000, 2000, 1, 50, 12)];
  const c = costCoverage(days);
  assert.equal(c.covered, 1);
  assert.equal(c.total, 2);
  assert.equal(c.full, false);
});

test("pickBandAxis — 원가가 창 전체를 덮어야 완전 기여 축", () => {
  const partial = [day("2026-09-19", 0, 0, 1, 0, 0), day("2026-09-20", 0, 0, 1, 50, 12)];
  assert.equal(pickBandAxis(partial), "marketing");
  const full = [day("2026-09-19", 0, 0, 1, 10, 3), day("2026-09-20", 0, 0, 1, 50, 12)];
  assert.equal(pickBandAxis(full), "contribution");
});

test("dailyValues — 축에 따라 원가를 빼거나 뺀다/안 뺀다", () => {
  const days = [day("2026-09-20", 10_000, 7_000, 1, 500, 12)];
  assert.deepEqual(dailyValues(days, "marketing"), [3_000]);
  assert.deepEqual(dailyValues(days, "contribution"), [2_500]);
});

test("adSpendStaleDays — 창 끝의 미입력 날만 센다 (0원 입력과 구분한다)", () => {
  const d = (adSpendWon: number, adRows: number): DailyPnl =>
    ({ bucket: "2026-09-20", revenueWon: 0, adSpendWon, adRows, apiCostWon: 0, costRows: 0 });
  assert.equal(adSpendStaleDays([d(100, 1), d(0, 0), d(100, 1), d(0, 0), d(0, 0)]), 2);
  assert.equal(adSpendStaleDays([d(100, 1), d(100, 1)]), 0);
  // 🔴 0원을 **입력한** 날은 미입력이 아니다 — 이게 adSpendWon 기준과 갈리는 지점이다.
  assert.equal(adSpendStaleDays([d(0, 1), d(0, 1)]), 0);
  assert.equal(adSpendStaleDays([d(0, 0), d(0, 0)]), 2);
  assert.equal(adSpendStaleDays([]), 0);
});
