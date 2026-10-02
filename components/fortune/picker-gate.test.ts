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

test("④ 로그인 · 내 사주 있음 → list (lockPrimary 와 무관)", () => {
  assert.equal(pickerGate({ profiles: [self, friend], lockPrimary: false, authenticated: true }), "list");
  assert.equal(pickerGate({ profiles: [self], lockPrimary: true, authenticated: true }), "list");
});

test("⑤ 로그인 · lockPrimary 아님 · 지인만 있음 → list (목록에서 고르거나 새 사람 입력)", () => {
  assert.equal(pickerGate({ profiles: [friend], lockPrimary: false, authenticated: true }), "list");
});
