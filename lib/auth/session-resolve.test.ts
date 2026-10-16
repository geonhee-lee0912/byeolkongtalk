import { test } from "node:test";
import assert from "node:assert/strict";
import { isBearerScheme, resolveSessionUserId } from "./session-resolve.ts";

const A = "2f1c7a3e-1b2c-4d5e-8f90-1234567890ab";
const B = "9a8b7c6d-1b2c-4d5e-8f90-1234567890ab";

test("Bearer 가 유효하면 토큰의 회원(쿠키가 다른 회원이어도)", () => {
  assert.equal(resolveSessionUserId({ hasBearer: true, tokenUserId: A, cookieUserId: B }), A);
});

test("Bearer 가 무효면 유효한 쿠키가 있어도 비로그인 — 쿠키로 넘어가지 않는다", () => {
  assert.equal(resolveSessionUserId({ hasBearer: true, tokenUserId: null, cookieUserId: B }), null);
});

test("Bearer 가 없으면 쿠키 — UUID 형식이 아니면 비로그인", () => {
  assert.equal(resolveSessionUserId({ hasBearer: false, tokenUserId: null, cookieUserId: B }), B);
  assert.equal(resolveSessionUserId({ hasBearer: false, tokenUserId: null, cookieUserId: "x,y" }), null);
  assert.equal(resolveSessionUserId({ hasBearer: false, tokenUserId: null, cookieUserId: undefined }), null);
});

test("Bearer 방식 판정 — 토큰이 비었거나 형식이 틀려도 Bearer 면 true, 다른 방식·없음은 false", () => {
  for (const h of ["Bearer abc.def", "bearer abc", "Bearer", "Bearer ", "Bearer a b", " Bearer abc "]) {
    assert.equal(isBearerScheme(h), true, h);
  }
  for (const h of [null, undefined, "", "Basic dXNlcjpwYXNz", "BearerX abc", "Token abc"]) {
    assert.equal(isBearerScheme(h), false, String(h));
  }
});
