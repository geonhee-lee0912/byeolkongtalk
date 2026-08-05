// lib/relationship/slots.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { slotAllowance } from "./types.ts";

test("슬롯 허용량 = 구매 수 (첫 사람부터 슬롯 필요)", () => {
  assert.equal(slotAllowance(0), 0);   // 구매 0 → 등록 불가(첫 사람도 결제)
  assert.equal(slotAllowance(1), 1);   // 슬롯 1 구매 → 1명
  assert.equal(slotAllowance(3), 3);
});

test("음수 방어", () => {
  assert.equal(slotAllowance(-5), 0);
});
