import { test } from "node:test";
import assert from "node:assert/strict";
import { STORE_FEE_RATE, storeRevenueRows } from "./store-revenue";

const row = (o: Record<string, unknown>) => ({
  provider: "apple", payments: 1, gross_won: 11000, refunded: 0, refunded_won: 0, shortfall_stars: 0, ...o,
});

test("수수료율은 15%", () => assert.equal(STORE_FEE_RATE, 0.15));

test("gross 11,000 → 수수료 1,650 · 순매출 9,350", () => {
  const { rows } = storeRevenueRows([row({})]);
  assert.equal(rows[0].label, "애플");
  assert.equal(rows[0].fee, 1650);
  assert.equal(rows[0].net, 9350);
});

test("환불 금액은 수수료 기준과 순매출에서 뺀다(스토어는 환불분 수수료도 돌려준다)", () => {
  const { rows } = storeRevenueRows([row({ gross_won: 22000, refunded: 1, refunded_won: 11000, shortfall_stars: 3 })]);
  assert.equal(rows[0].fee, 1650);
  assert.equal(rows[0].net, 9350);
  assert.equal(rows[0].refunded, 1);
  assert.equal(rows[0].refundedWon, 11000);
  assert.equal(rows[0].shortfallStars, 3);
});

test("bigint 가 문자열로 와도 숫자로 읽는다 · 합계 줄", () => {
  const { rows, total } = storeRevenueRows([
    row({ payments: "2", gross_won: "11000" }),
    row({ provider: "google", payments: "1", gross_won: "1000", shortfall_stars: "2" }),
  ]);
  assert.equal(rows[1].label, "구글");
  assert.equal(total.payments, 3);
  assert.equal(total.gross, 12000);
  assert.equal(total.fee, 1800);
  assert.equal(total.net, 10200);
  assert.equal(total.shortfallStars, 2);
});

test("행 없음 → 빈 목록 + 0 합계", () => {
  const { rows, total } = storeRevenueRows([]);
  assert.deepEqual(rows, []);
  assert.equal(total.gross, 0);
  assert.equal(total.net, 0);
});
