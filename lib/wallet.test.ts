import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWallet } from "./wallet.ts";

test("parseWallet — 정상 응답", () => {
  assert.deepEqual(parseWallet({ balance: 15, isGuest: false, giftUnused: true, menuArm: "menu" }), {
    balance: 15,
    giftUnused: true,
    menuArm: "menu",
  });
  assert.deepEqual(parseWallet({ balance: 0, isGuest: true, giftUnused: false, menuArm: "legacy" }), {
    balance: 0,
    giftUnused: false,
    menuArm: "legacy",
  });
});

test("parseWallet — 모르는 값·실패는 안전한 쪽(잔액 0 · 선물 약속 없음 · 옛 그룹 = 지금 prod)", () => {
  const safe = { balance: 0, giftUnused: false, menuArm: "legacy" };
  assert.deepEqual(parseWallet(null), safe);
  assert.deepEqual(parseWallet(undefined), safe);
  assert.deepEqual(parseWallet({ balance: "3", giftUnused: "true", menuArm: "x" }), safe);
});
