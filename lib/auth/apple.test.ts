import { test } from "node:test";
import assert from "node:assert/strict";
import { createLocalJWKSet, decodeProtectedHeader, exportJWK, exportPKCS8, generateKeyPair, jwtVerify, SignJWT } from "jose";
import {
  APPLE_ISSUER,
  appleClientSecret,
  appleNonceHash,
  exchangeAppleCode,
  revokeAppleToken,
  verifyAppleIdentityToken,
} from "./apple.ts";

const BUNDLE = "com.byeolkongtalk.app";
const SUB = "001234.abcd.0987";

async function keyset() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  return { privateKey, keys: createLocalJWKSet({ keys: [jwk] }) };
}

async function idToken(
  privateKey: CryptoKey,
  c: { iss?: string; aud?: string; sub?: string; nonce?: string; iat?: number; exp?: number },
) {
  return new SignJWT({ nonce: c.nonce })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(c.iss ?? APPLE_ISSUER)
    .setAudience(c.aud ?? BUNDLE)
    .setSubject(c.sub ?? SUB)
    .setIssuedAt(c.iat ?? 1_000)
    .setExpirationTime(c.exp ?? 2_000)
    .sign(privateKey);
}

test("정상 토큰이면 sub 를 돌려준다", async () => {
  const { privateKey, keys } = await keyset();
  const nonce = appleNonceHash("raw-nonce");
  const t = await idToken(privateKey, { nonce });
  assert.deepEqual(await verifyAppleIdentityToken(t, { audience: BUNDLE, expectedNonce: nonce, keys, nowSec: 1_500 }), { sub: SUB });
});

test("대상·발급자·만료·nonce 가 틀리면 null", async () => {
  const { privateKey, keys } = await keyset();
  const nonce = appleNonceHash("raw-nonce");
  const opts = { audience: BUNDLE, expectedNonce: nonce, keys, nowSec: 1_500 };
  assert.equal(await verifyAppleIdentityToken(await idToken(privateKey, { nonce, aud: "other.app" }), opts), null);
  assert.equal(await verifyAppleIdentityToken(await idToken(privateKey, { nonce, iss: "https://evil.example" }), opts), null);
  assert.equal(await verifyAppleIdentityToken(await idToken(privateKey, { nonce, exp: 1_200 }), opts), null);
  assert.equal(await verifyAppleIdentityToken(await idToken(privateKey, { nonce: appleNonceHash("other") }), opts), null);
});

test("다른 키로 서명된 토큰은 null", async () => {
  const { keys } = await keyset();
  const other = await keyset();
  const nonce = appleNonceHash("raw-nonce");
  const t = await idToken(other.privateKey, { nonce });
  assert.equal(await verifyAppleIdentityToken(t, { audience: BUNDLE, expectedNonce: nonce, keys, nowSec: 1_500 }), null);
});

test("client_secret 은 ES256 · kid · iss=팀 · sub=client_id · aud=애플 · 5분", async () => {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const pem = await exportPKCS8(privateKey);
  const secret = await appleClientSecret(
    BUNDLE,
    { APPLE_TEAM_ID: "TEAM123", APPLE_KEY_ID: "KEY456", APPLE_PRIVATE_KEY: pem.replace(/\n/g, "\\n") },
    1_000,
  );
  assert.equal(decodeProtectedHeader(secret).kid, "KEY456");
  const { payload } = await jwtVerify(secret, publicKey, {
    currentDate: new Date(1_100 * 1000),
    audience: APPLE_ISSUER,
    issuer: "TEAM123",
  });
  assert.equal(payload.sub, BUNDLE);
  assert.equal(payload.exp, 1_300);
});

test("client_secret — 환경 변수가 없으면 throw", async () => {
  await assert.rejects(() => appleClientSecret(BUNDLE, {}));
});

test("인가 코드 교환은 리프레시 토큰을 돌려주고, 실패면 null", async () => {
  const bodies: URLSearchParams[] = [];
  const ok = async (_url: string, init?: RequestInit) => {
    bodies.push(new URLSearchParams(init!.body as URLSearchParams));
    return new Response(JSON.stringify({ refresh_token: "r1", access_token: "a1" }), { status: 200 });
  };
  assert.deepEqual(
    await exchangeAppleCode("c1", BUNDLE, { clientSecret: "cs", fetchImpl: ok, redirectUri: "https://x.example/cb" }),
    { refreshToken: "r1" },
  );
  assert.equal(bodies[0].get("grant_type"), "authorization_code");
  assert.equal(bodies[0].get("client_id"), BUNDLE);
  assert.equal(bodies[0].get("client_secret"), "cs");
  assert.equal(bodies[0].get("redirect_uri"), "https://x.example/cb");
  const bad = async () => new Response("{}", { status: 400 });
  assert.equal(await exchangeAppleCode("c1", BUNDLE, { clientSecret: "cs", fetchImpl: bad }), null);
  assert.equal(await exchangeAppleCode("", BUNDLE, { clientSecret: "cs", fetchImpl: ok }), null);
});

test("revoke 는 200 이면 true, 아니면 false", async () => {
  const bodies: URLSearchParams[] = [];
  const ok = async (_url: string, init?: RequestInit) => {
    bodies.push(new URLSearchParams(init!.body as URLSearchParams));
    return new Response("", { status: 200 });
  };
  assert.equal(await revokeAppleToken("r1", BUNDLE, { clientSecret: "cs", fetchImpl: ok }), true);
  assert.equal(bodies[0].get("token"), "r1");
  assert.equal(bodies[0].get("token_type_hint"), "refresh_token");
  const bad = async () => new Response("", { status: 400 });
  assert.equal(await revokeAppleToken("r1", BUNDLE, { clientSecret: "cs", fetchImpl: bad }), false);
});
