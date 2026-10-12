import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { ACCESS_TTL_SEC, parseBearer, signAccessToken, verifyAccessToken } from "./app-token.ts";

const SECRET = "s".repeat(40);
const USER = "2f1c7a3e-1b2c-4d5e-8f90-1234567890ab";

test("발급한 토큰은 같은 회원으로 검증되고 만료는 1시간 뒤", async () => {
  const { token, expiresAt } = await signAccessToken(USER, { secret: SECRET, nowSec: 1_000 });
  assert.equal(expiresAt, (1_000 + 3600) * 1000);
  assert.equal(ACCESS_TTL_SEC, 3600);
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

// 직접 서명한 토큰 — 검증 설정(iss·aud·alg·typ·v·exp)을 하나씩 어긋나게 만든다
type Forge = { typ?: string; v?: number; sub?: string; iss?: string; aud?: string; alg?: "HS256" | "HS512"; key?: string; exp?: boolean };
async function forge(o: Forge = {}): Promise<string> {
  let jwt = new SignJWT({ typ: o.typ ?? "access", v: o.v ?? 1 })
    .setProtectedHeader({ alg: o.alg ?? "HS256" })
    .setSubject(o.sub ?? USER)
    .setIssuer(o.iss ?? "byeolkongtalk")
    .setAudience(o.aud ?? "byeolkong-app")
    .setIssuedAt(1_000);
  if (o.exp !== false) jwt = jwt.setExpirationTime(5_000);
  return jwt.sign(new TextEncoder().encode(o.key ?? SECRET));
}
const check = async (o: Forge) => verifyAccessToken(await forge(o), { secret: SECRET, nowSec: 1_100 });

test("직접 서명한 정상 토큰은 통과한다 — 아래 거절 테스트들의 양성 대조", async () => {
  assert.equal(await check({}), USER);
});

test("종류(typ)·버전(v)·sub 형식이 다르면 null", async () => {
  assert.equal(await check({ typ: "refresh" }), null);
  assert.equal(await check({ v: 2 }), null);
  assert.equal(await check({ sub: "not-a-uuid" }), null);
});

test("발급자·대상·알고리즘이 다르거나 exp 가 없으면 null", async () => {
  assert.equal(await check({ iss: "evil" }), null);
  assert.equal(await check({ aud: "other" }), null);
  assert.equal(await check({ alg: "HS512" }), null);
  assert.equal(await check({ exp: false }), null);
});

test("짧은 비밀값·비밀값 미설정 — 발급은 throw, 검증은 null(fail-closed)", async () => {
  await assert.rejects(() => signAccessToken(USER, { secret: "short" }));
  assert.equal(await verifyAccessToken(await forge({ key: "short" }), { secret: "short", nowSec: 1_100 }), null);
  const saved = process.env.APP_ACCESS_TOKEN_SECRET;
  delete process.env.APP_ACCESS_TOKEN_SECRET;
  try {
    assert.equal(await verifyAccessToken(await forge({}), { nowSec: 1_100 }), null);
    await assert.rejects(() => signAccessToken(USER));
  } finally {
    if (saved !== undefined) process.env.APP_ACCESS_TOKEN_SECRET = saved;
  }
});

test("UUID 가 아닌 회원 ID 로는 발급하지 않는다", async () => {
  await assert.rejects(() => signAccessToken("not-a-uuid", { secret: SECRET }));
});

test("parseBearer — 'Bearer <토큰>' 만 꺼낸다(대소문자 무시)", () => {
  assert.equal(parseBearer("Bearer abc.def"), "abc.def");
  assert.equal(parseBearer("bearer abc"), "abc");
  assert.equal(parseBearer("Bearer "), null);
  assert.equal(parseBearer("Basic abc"), null);
  assert.equal(parseBearer(null), null);
});
