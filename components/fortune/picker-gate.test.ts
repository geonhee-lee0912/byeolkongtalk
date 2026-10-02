import { test } from "node:test";
import assert from "node:assert/strict";
import { pickerGate } from "./picker-gate.ts";

const self = { isPrimary: true };
const friend = { isPrimary: false };

test("① 비로그인 — 프로필 0 이면 login", () => {
  assert.equal(pickerGate({ profiles: [], lockPrimary: false, authenticated: false }), "login");
});

test("② 로그인 · 프로필 0 → birth", () => {
  assert.equal(pickerGate({ profiles: [], lockPrimary: false, authenticated: true }), "birth");
});

test("③ 로그인 · lockPrimary · 지인만 있음 → birth", () => {
  assert.equal(pickerGate({ profiles: [friend], lockPrimary: true, authenticated: true }), "birth");
});

test("④ 내 사주 있음 → list (lockPrimary·authenticated 와 무관)", () => {
  assert.equal(pickerGate({ profiles: [self, friend], lockPrimary: false, authenticated: true }), "list");
  assert.equal(pickerGate({ profiles: [self], lockPrimary: true, authenticated: true }), "list");
  // 구매 칸의 탐침(authenticated:true 로 list 여부만 먼저 본다)이 기대는 계약 —
  // authenticated 는 벽을 login/birth 로 나눌 뿐 list 여부를 바꾸지 않는다.
  assert.equal(pickerGate({ profiles: [self], lockPrimary: false, authenticated: false }), "list");
});

test("⑤ 로그인 · lockPrimary 아님 · 지인만 있음 → list (목록에서 고르거나 새 사람 입력)", () => {
  assert.equal(pickerGate({ profiles: [friend], lockPrimary: false, authenticated: true }), "list");
});

test("⑥ 로그인 · 내 사주는 있는데 생일 없음 → list (벽 아님 — 지인 사주는 계속 살 수 있어야 한다)", () => {
  const selfNoBirth = { isPrimary: true, birthDate: null };
  assert.equal(pickerGate({ profiles: [selfNoBirth], lockPrimary: false, authenticated: true }), "list");
});
