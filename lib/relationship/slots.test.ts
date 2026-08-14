// lib/relationship/slots.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { slotAllowance } from "./types.ts";

test("슬롯 허용량 = 1 무료 + 구매 수 (첫 사람 무료, 2026-08-14)", () => {
  assert.equal(slotAllowance(0), 1);   // 구매 0 → 첫 사람은 무료 슬롯 1
  assert.equal(slotAllowance(1), 2);   // 슬롯 1 구매 → 무료 1 + 1 = 2명
  assert.equal(slotAllowance(3), 4);
});

test("음수 방어 — 무료 슬롯 1 은 유지", () => {
  assert.equal(slotAllowance(-5), 1);
});
