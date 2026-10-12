import { test } from "node:test";
import assert from "node:assert/strict";
import { hashSecretToken, newSecretToken, HANDOFF_TTL_MS, REFRESH_TTL_MS } from "./secret-token.ts";

test("새 토큰은 매번 다르고 32바이트 base64url(43자)", () => {
  const a = newSecretToken();
  const b = newSecretToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
});

test("해시는 결정적이고 원본과 다른 64자 hex", () => {
  assert.equal(hashSecretToken("x"), hashSecretToken("x"));
  assert.notEqual(hashSecretToken("x"), "x");
  assert.match(hashSecretToken("x"), /^[0-9a-f]{64}$/);
});

test("수명: 리프레시 90일 · 교환 코드 60초", () => {
  assert.equal(REFRESH_TTL_MS, 90 * 24 * 60 * 60 * 1000);
  assert.equal(HANDOFF_TTL_MS, 60 * 1000);
});
