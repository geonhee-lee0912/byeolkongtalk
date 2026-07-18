import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPassRemaining } from "./passDisplay.ts";

const H = 3600_000;
const M = 60_000;

test("1시간 이상은 시간 단위 (남은/총)", () => {
  assert.equal(formatPassRemaining(48 * H, 3, 0), "48/72시간");
  assert.equal(formatPassRemaining(72 * H, 3, 0), "72/72시간");
  assert.equal(formatPassRemaining(5 * H, 1, 0), "5/24시간");
  assert.equal(formatPassRemaining(100 * H, 7, 0), "100/168시간");
});

test("소수 시간은 내림", () => {
  assert.equal(formatPassRemaining(48 * H + 59 * M, 3, 0), "48/72시간");
});

test("스택 재구매로 총시간 초과면 분수 없이 남음", () => {
  assert.equal(formatPassRemaining(82 * H, 3, 0), "82시간 남음");
});

test("마지막 1시간은 10분 버킷 (분/총)", () => {
  assert.equal(formatPassRemaining(40 * M, 3, 0), "40분/72시간");
  assert.equal(formatPassRemaining(55 * M, 3, 0), "50분/72시간");
  assert.equal(formatPassRemaining(9 * M, 3, 0), "10분/72시간");
  assert.equal(formatPassRemaining(60 * M, 3, 0), "1/72시간");
});

test("만료", () => {
  assert.equal(formatPassRemaining(0, 3, 1), "만료");
});
