import { test } from "node:test";
import assert from "node:assert/strict";
import { continuationPrice, fullCostFor, CONTINUATION_DISCOUNT_RATE } from "./continuation.ts";

test("deep = 정가의 60% 반올림", () => {
  assert.equal(continuationPrice(20, "deep"), 12); // 사주
  assert.equal(continuationPrice(10, "deep"), 6);  // 옛 그룹 one_card
  assert.equal(continuationPrice(15, "deep"), 9);  // 메뉴판 one_card · two_card
  assert.equal(continuationPrice(25, "deep"), 15); // three_card
  assert.equal(continuationPrice(40, "deep"), 24); // 옛 그룹 5장
  assert.equal(continuationPrice(55, "deep"), 33); // 메뉴판 5·6장 · 옛 그룹 7장
  assert.equal(continuationPrice(70, "deep"), 42); // 메뉴판 7장
});

test("fresh = 정가 그대로", () => {
  assert.equal(continuationPrice(20, "fresh"), 20);
  assert.equal(continuationPrice(55, "fresh"), 55);
});

test("CONTINUATION_DISCOUNT_RATE 는 0.6", () => {
  assert.equal(CONTINUATION_DISCOUNT_RATE, 0.6);
});

test("fullCostFor — 타로는 반반 그룹 가격, 사주는 공통 정가", () => {
  assert.equal(fullCostFor({ consultationType: "tarot", spreadType: "one_card", arm: "menu" }), 15);
  assert.equal(fullCostFor({ consultationType: "tarot", spreadType: "one_card", arm: "legacy" }), 10);
  assert.equal(fullCostFor({ consultationType: "tarot", spreadType: "relationship_5", arm: "menu" }), 55);
  assert.equal(fullCostFor({ consultationType: "tarot", spreadType: "relationship_5", arm: "legacy" }), 40);
  assert.equal(fullCostFor({ consultationType: "saju", spreadType: null, arm: "menu" }), 20);
  assert.equal(fullCostFor({ consultationType: "saju", spreadType: null, arm: "legacy" }), 20);
});
