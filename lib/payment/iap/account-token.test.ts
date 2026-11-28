// 스토어 계정 토큰(애플 appAccountToken · 구글 obfuscatedAccountId) — 회원마다 고정된 UUID v4 모양 값.
// 애플은 UUID 가 아니면 구매를 거절하고, 구글은 64자 이하만 받는다. 같은 회원 = 같은 값이어야 미완료 거래 재전송이 그 회원에게만 간다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { iapAccountToken } from "./account-token.ts";

const SECRET = "x".repeat(48);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("UUID v4 모양(버전 4·변형 비트), 소문자, 64자 이하", () => {
  const t = iapAccountToken("11111111-1111-4111-8111-111111111111", SECRET);
  assert.match(t, UUID_V4);
  assert.ok(t.length <= 64);
});

test("같은 회원·같은 비밀값이면 늘 같고, 회원이나 비밀값이 다르면 다르다", () => {
  const a = iapAccountToken("user-a", SECRET);
  assert.equal(iapAccountToken("user-a", SECRET), a);
  assert.notEqual(iapAccountToken("user-b", SECRET), a);
  assert.notEqual(iapAccountToken("user-a", "y".repeat(48)), a);
  assert.notEqual(a, "user-a");
});

test("비밀값이 없거나 32자 미만이면 던진다(앱 토큰과 같은 기준) — 기본값은 APP_ACCESS_TOKEN_SECRET", () => {
  delete process.env.APP_ACCESS_TOKEN_SECRET;
  assert.throws(() => iapAccountToken("user-a"));
  assert.throws(() => iapAccountToken("user-a", "short"));
  process.env.APP_ACCESS_TOKEN_SECRET = SECRET;
  assert.equal(iapAccountToken("user-a"), iapAccountToken("user-a", SECRET));
  delete process.env.APP_ACCESS_TOKEN_SECRET;
});
