// lib/relationship/slots.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { slotAllowance } from "./types.ts";

test("슬롯 허용량 = 1(무료) + 구매 수", () => {
  assert.equal(slotAllowance(0), 1);   // 구매 0 → 첫 상대만
  assert.equal(slotAllowance(1), 2);   // 슬롯 1 구매 → 2명
  assert.equal(slotAllowance(3), 4);
});

test("음수 방어", () => {
  assert.equal(slotAllowance(-5), 1);
});
