import { test } from "node:test";
import assert from "node:assert/strict";
import { autoSlotSelf, noOneToPick } from "./dual-picker.ts";

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

// noOneToPick — 활성 칸에 고를 사람이 없나(목록 자리에 큰 "+ 새 사람 입력"을 둘지).
const P = (id: string) => ({ id });

test("noOneToPick ① 내 사주만 · 첫 칸에 나 · 둘째 칸 활성 → true (생일 저장 직후 — 상대를 넣을 차례)", () => {
  assert.equal(noOneToPick({ profiles: [P(ME)], active: "B", slotA: ME, slotB: null }), true);
});

test("noOneToPick ② 둘째 칸에 이미 고른 사람 → false (고른 사람이 목록에 보인다)", () => {
  assert.equal(noOneToPick({ profiles: [P(ME), P(FRIEND)], active: "B", slotA: ME, slotB: FRIEND }), false);
});

test("noOneToPick ③ 첫 칸 활성 · 내 사주만 · 첫 칸에 나 → false (지금 칸의 사람은 목록에 보인다)", () => {
  assert.equal(noOneToPick({ profiles: [P(ME)], active: "A", slotA: ME, slotB: null }), false);
});

test("noOneToPick ④ 고를 사람이 남아 있음 → false", () => {
  assert.equal(noOneToPick({ profiles: [P(ME), P(FRIEND)], active: "B", slotA: ME, slotB: null }), false);
  assert.equal(noOneToPick({ profiles: [P(FRIEND)], active: "A", slotA: null, slotB: null }), false);
});

test("noOneToPick ⑤ 첫 칸 활성 · 유일한 사람이 둘째 칸에 → true", () => {
  assert.equal(noOneToPick({ profiles: [P(FRIEND)], active: "A", slotA: null, slotB: FRIEND }), true);
});
