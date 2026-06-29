import { test } from "node:test";
import assert from "node:assert/strict";
import { continuationPrice, fullCostFor, CONTINUATION_DISCOUNT_RATE } from "./continuation.ts";

test("deep = 정가의 60% 반올림", () => {
  assert.equal(continuationPrice(20, "deep"), 12); // 사주
  assert.equal(continuationPrice(10, "deep"), 6);  // one_card
  assert.equal(continuationPrice(15, "deep"), 9);  // two_card
  assert.equal(continuationPrice(25, "deep"), 15); // three_card
  assert.equal(continuationPrice(40, "deep"), 24); // relationship_5
});

test("fresh = 정가 그대로", () => {
  assert.equal(continuationPrice(20, "fresh"), 20);
  assert.equal(continuationPrice(40, "fresh"), 40);
});

test("CONTINUATION_DISCOUNT_RATE 는 0.6", () => {
  assert.equal(CONTINUATION_DISCOUNT_RATE, 0.6);
});

test("fullCostFor — 타로는 스프레드 정가, 그 외 사주 정가", () => {
  assert.equal(fullCostFor({ consultationType: "tarot", spreadType: "one_card" }), 10);
  assert.equal(fullCostFor({ consultationType: "tarot", spreadType: "relationship_5" }), 40);
  assert.equal(fullCostFor({ consultationType: "saju", spreadType: null }), 20);
});
