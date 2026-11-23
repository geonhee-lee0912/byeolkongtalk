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
  assert.equal(hashSecretToken("x"), "2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881"); // DB 에 영속되는 키 — 알고리즘이 바뀌면 모든 앱 로그인이 조용히 풀린다
});

test("수명: 리프레시 90일 · 교환 코드 60초", () => {
  assert.equal(REFRESH_TTL_MS, 90 * 24 * 60 * 60 * 1000);
  assert.equal(HANDOFF_TTL_MS, 60 * 1000);
});
