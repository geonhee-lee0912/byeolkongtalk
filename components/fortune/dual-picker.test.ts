import { test } from "node:test";
import assert from "node:assert/strict";
import { autoSlotSelf } from "./dual-picker.ts";

const ME = "me";
const FRIEND = "friend";

test("① 첫 조회(두 칸 빔) · 내 사주 있음 → 첫 칸에 넣는다", () => {
  assert.equal(autoSlotSelf({ selfId: ME, slotA: null, slotB: null }), true);
});

test("② 내 사주 없음 → 넣지 않는다", () => {
  assert.equal(autoSlotSelf({ selfId: null, slotA: null, slotB: null }), false);
  assert.equal(autoSlotSelf({ selfId: null, slotA: FRIEND, slotB: null }), false);
});

test("③ 첫 칸이 이미 차 있음(나든 지인이든) → 그대로", () => {
  assert.equal(autoSlotSelf({ selfId: ME, slotA: ME, slotB: null }), false);
  assert.equal(autoSlotSelf({ selfId: ME, slotA: ME, slotB: FRIEND }), false);
  assert.equal(autoSlotSelf({ selfId: ME, slotA: FRIEND, slotB: null }), false);
});

test("④ 둘째 칸에 나 → 그대로 — 생일 저장 뒤 재조회에서 같은 사람이 두 칸에 들어가지 않는다", () => {
  assert.equal(autoSlotSelf({ selfId: ME, slotA: FRIEND, slotB: ME }), false);
  assert.equal(autoSlotSelf({ selfId: ME, slotA: null, slotB: ME }), false);
});

test("⑤ 첫 칸 빔 · 둘째 칸 지인 → 첫 칸에 넣는다", () => {
  assert.equal(autoSlotSelf({ selfId: ME, slotA: null, slotB: FRIEND }), true);
});
