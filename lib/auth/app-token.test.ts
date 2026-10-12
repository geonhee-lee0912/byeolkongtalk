import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { parseBearer, signAccessToken, verifyAccessToken } from "./app-token.ts";

const SECRET = "s".repeat(40);
const USER = "2f1c7a3e-1b2c-4d5e-8f90-1234567890ab";

test("발급한 토큰은 같은 회원으로 검증되고 만료는 1시간 뒤", async () => {
  const { token, expiresAt } = await signAccessToken(USER, { secret: SECRET, nowSec: 1_000 });
  assert.equal(expiresAt, (1_000 + 3600) * 1000);
  assert.equal(await verifyAccessToken(token, { secret: SECRET, nowSec: 1_100 }), USER);
});

test("만료 뒤엔 null", async () => {
  const { token } = await signAccessToken(USER, { secret: SECRET, nowSec: 1_000 });
  assert.equal(await verifyAccessToken(token, { secret: SECRET, nowSec: 1_000 + 3601 }), null);
});

test("다른 비밀값·변조된 서명은 null", async () => {
  const { token } = await signAccessToken(USER, { secret: SECRET, nowSec: 1_000 });
  assert.equal(await verifyAccessToken(token, { secret: "t".repeat(40), nowSec: 1_100 }), null);
  const tampered = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA");
  assert.equal(await verifyAccessToken(tampered, { secret: SECRET, nowSec: 1_100 }), null);
});

test("종류가 access 가 아니거나 sub 가 UUID 가 아니면 null", async () => {
  const key = new TextEncoder().encode(SECRET);
  const base = (typ: string, sub: string) =>
    new SignJWT({ typ, v: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(sub)
      .setIssuer("byeolkongtalk")
      .setAudience("byeolkong-app")
      .setIssuedAt(1_000)
      .setExpirationTime(5_000)
      .sign(key);
  assert.equal(await verifyAccessToken(await base("refresh", USER), { secret: SECRET, nowSec: 1_100 }), null);
  assert.equal(await verifyAccessToken(await base("access", "not-a-uuid"), { secret: SECRET, nowSec: 1_100 }), null);
});

test("비밀값이 없거나 짧으면 발급은 throw, 검증은 null(fail-closed)", async () => {
  await assert.rejects(() => signAccessToken(USER, { secret: "short" }));
  assert.equal(await verifyAccessToken("a.b.c", { secret: "short" }), null);
});

test("parseBearer — 'Bearer <토큰>' 만 꺼낸다(대소문자 무시)", () => {
  assert.equal(parseBearer("Bearer abc.def"), "abc.def");
  assert.equal(parseBearer("bearer abc"), "abc");
  assert.equal(parseBearer("Bearer "), null);
  assert.equal(parseBearer("Basic abc"), null);
  assert.equal(parseBearer(null), null);
});
