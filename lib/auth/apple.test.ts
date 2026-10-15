import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CompactSign,
  createLocalJWKSet,
  createRemoteJWKSet,
  customFetch,
  decodeProtectedHeader,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  jwtVerify,
  SignJWT,
  type FetchImplementation,
} from "jose";
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
const TOKEN_URL = "https://appleid.apple.com/auth/token";
const REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const TOKEN_INVALID = { ok: false, reason: "token_invalid" };
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

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
  assert.deepEqual(await verifyAppleIdentityToken(t, { audience: BUNDLE, expectedNonce: nonce, keys, nowSec: 1_500 }), {
    ok: true,
    sub: SUB,
  });
});

test("다른 클라이언트(번들 ID·Services ID)용 진짜 토큰은 aud_mismatch — 토큰의 aud 를 같이 준다", async () => {
  const { privateKey, keys } = await keyset();
  const nonce = appleNonceHash("raw-nonce");
  const t = await idToken(privateKey, { nonce, aud: "com.byeolkongtalk.app.dev" });
  assert.deepEqual(await verifyAppleIdentityToken(t, { audience: BUNDLE, expectedNonce: nonce, keys, nowSec: 1_500 }), {
    ok: false,
    reason: "aud_mismatch",
    aud: "com.byeolkongtalk.app.dev",
  });
});

test("발급자·만료·nonce 가 틀리면 token_invalid", async () => {
  const { privateKey, keys } = await keyset();
  const nonce = appleNonceHash("raw-nonce");
  const opts = { audience: BUNDLE, expectedNonce: nonce, keys, nowSec: 1_500 };
  assert.deepEqual(await verifyAppleIdentityToken(await idToken(privateKey, { nonce, iss: "https://evil.example" }), opts), TOKEN_INVALID);
  assert.deepEqual(await verifyAppleIdentityToken(await idToken(privateKey, { nonce, exp: 1_200 }), opts), TOKEN_INVALID);
  assert.deepEqual(await verifyAppleIdentityToken(await idToken(privateKey, { nonce: appleNonceHash("other") }), opts), TOKEN_INVALID);
});

test("다른 키로 서명된 토큰은 token_invalid", async () => {
  const { keys } = await keyset();
  const other = await keyset();
  const nonce = appleNonceHash("raw-nonce");
  const t = await idToken(other.privateKey, { nonce });
  assert.deepEqual(await verifyAppleIdentityToken(t, { audience: BUNDLE, expectedNonce: nonce, keys, nowSec: 1_500 }), TOKEN_INVALID);
});

test("RS256 아닌 토큰은 공개키를 묻기 전에 token_invalid", async () => {
  let asked = 0;
  const keys = async () => {
    asked++;
    throw new Error("공개키를 물으면 안 된다");
  };
  const nonce = appleNonceHash("raw-nonce");
  const hs = await new SignJWT({ nonce })
    .setProtectedHeader({ alg: "HS256", kid: "k1" })
    .setIssuer(APPLE_ISSUER)
    .setAudience(BUNDLE)
    .setSubject(SUB)
    .setIssuedAt(1_000)
    .setExpirationTime(2_000)
    .sign(new TextEncoder().encode("x".repeat(32)));
  assert.deepEqual(await verifyAppleIdentityToken(hs, { audience: BUNDLE, expectedNonce: nonce, keys, nowSec: 1_500 }), TOKEN_INVALID);
  assert.equal(asked, 0);
});

test("토큰 쪽 문제는 전부 token_invalid — 위조 토큰이 500·오류 로그로 새지 않게", async () => {
  const a = await generateKeyPair("RS256");
  const b = await generateKeyPair("RS256");
  // 애플처럼 키가 여러 개인 목록
  const keys = createLocalJWKSet({
    keys: [
      { ...(await exportJWK(a.publicKey)), kid: "k1", alg: "RS256", use: "sig" },
      { ...(await exportJWK(b.publicKey)), kid: "k2", alg: "RS256", use: "sig" },
    ],
  });
  const nonce = appleNonceHash("raw-nonce");
  const opts = { audience: BUNDLE, expectedNonce: nonce, keys, nowSec: 1_500 };
  const b64 = (v: unknown) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
  const claims = { iss: APPLE_ISSUER, aud: BUNDLE, sub: SUB, nonce, iat: 1_000, exp: 2_000 };
  const signed = (header: { alg: string; kid?: string }, payload: object | string = claims) =>
    new CompactSign(new TextEncoder().encode(typeof payload === "string" ? payload : JSON.stringify(payload)))
      .setProtectedHeader(header)
      .sign(a.privateKey);
  const cases: [string, string][] = [
    ["쓰레기 문자열", "garbage"],
    ["세 조각 쓰레기", "a.b.c"],
    ["crit 에 모르는 확장", `${b64({ alg: "RS256", kid: "k1", crit: ["x"], x: 1 })}.${b64(claims)}.${b64("sig")}`],
    ["모르는 kid", await signed({ alg: "RS256", kid: "nope" })],
    ["kid 없음 + 키 여러 개", await signed({ alg: "RS256" })],
    ["서명 위조", `${b64({ alg: "RS256", kid: "k1" })}.${b64(claims)}.${b64("sig")}`],
    ["본문이 JSON 아님", await signed({ alg: "RS256", kid: "k1" }, "not json")],
    ["exp 없음", await signed({ alg: "RS256", kid: "k1" }, { ...claims, exp: undefined })],
    ["iat 없음", await signed({ alg: "RS256", kid: "k1" }, { ...claims, iat: undefined })],
    ["aud 없음(불일치가 아니라 누락)", await signed({ alg: "RS256", kid: "k1" }, { ...claims, aud: undefined })],
    ["sub 빈 문자열", await signed({ alg: "RS256", kid: "k1" }, { ...claims, sub: "" })],
  ];
  for (const [name, t] of cases) assert.deepEqual(await verifyAppleIdentityToken(t, opts), TOKEN_INVALID, name);
});

test("애플 공개키를 못 받으면(네트워크·타임아웃·비200·JSON 아님·키 목록 형식) throw — 무효 토큰으로 접지 않는다", async () => {
  const { privateKey } = await keyset();
  const nonce = appleNonceHash("raw-nonce");
  const t = await idToken(privateKey, { nonce });
  let calls = 0;
  const failures: FetchImplementation[] = [
    async () => {
      calls++;
      throw new TypeError("fetch failed");
    },
    async () => {
      calls++;
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); // jose 가 JWKSTimeout 으로 바꾼다
    },
    async () => (calls++, new Response("oops", { status: 503 })),
    async () => (calls++, new Response("<html>", { status: 200 })),
    async () => (calls++, new Response(JSON.stringify({ keys: "x" }), { status: 200 })),
  ];
  for (const f of failures) {
    // 가짜 fetch 로만 — 실제 네트워크로 나가지 않는다(.invalid 는 예약 도메인)
    const keys = createRemoteJWKSet(new URL("https://jwks.invalid/keys"), { [customFetch]: f });
    await assert.rejects(verifyAppleIdentityToken(t, { audience: BUNDLE, expectedNonce: nonce, keys, nowSec: 1_500 }));
  }
  assert.equal(calls, failures.length);
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

test("client_secret — 환경 변수가 하나라도 없으면 throw", async () => {
  await assert.rejects(() => appleClientSecret(BUNDLE, {}));
  const full = { APPLE_TEAM_ID: "T", APPLE_KEY_ID: "K", APPLE_PRIVATE_KEY: "P" };
  for (const k of Object.keys(full) as (keyof typeof full)[]) {
    await assert.rejects(appleClientSecret(BUNDLE, { ...full, [k]: "" }), /not set/);
  }
});

type Call = { url: string; body: URLSearchParams; hasSignal: boolean };
function fakeFetch(res: () => Response, calls: Call[] = []): FetchLike {
  return async (url, init) => {
    calls.push({ url, body: new URLSearchParams(init?.body as URLSearchParams), hasSignal: init?.signal instanceof AbortSignal });
    return res();
  };
}

test("인가 코드 교환 — 리프레시 토큰을 돌려준다(주소·본문·타임아웃 신호)", async () => {
  const calls: Call[] = [];
  const ok = fakeFetch(() => new Response(JSON.stringify({ refresh_token: "r1", access_token: "a1" }), { status: 200 }), calls);
  assert.deepEqual(
    await exchangeAppleCode("c1", BUNDLE, { clientSecret: "cs", fetchImpl: ok, redirectUri: "https://x.example/cb" }),
    { refreshToken: "r1" },
  );
  assert.equal(calls[0].url, TOKEN_URL);
  assert.equal(calls[0].hasSignal, true);
  assert.deepEqual(Object.fromEntries(calls[0].body), {
    client_id: BUNDLE,
    client_secret: "cs",
    code: "c1",
    grant_type: "authorization_code",
    redirect_uri: "https://x.example/cb",
  });
  await exchangeAppleCode("c2", BUNDLE, { clientSecret: "cs", fetchImpl: ok }); // 앱(네이티브) 코드는 redirect_uri 없이
  assert.equal(calls[1].body.has("redirect_uri"), false);
  assert.equal(await exchangeAppleCode("", BUNDLE, { clientSecret: "cs", fetchImpl: ok }), null); // 빈 코드는 묻지 않는다
  assert.equal(calls.length, 2);
});

test("인가 코드 교환 — 코드 만료·재사용(invalid_grant)만 null, 설정 오류·장애·이상한 응답·네트워크 오류는 throw", async () => {
  const json = (status: number, body: unknown): FetchLike => async () => new Response(JSON.stringify(body), { status });
  const opts = (fetchImpl: FetchLike) => ({ clientSecret: "SECRET-cs", fetchImpl });
  assert.equal(
    await exchangeAppleCode("c1", BUNDLE, opts(json(400, { error: "invalid_grant", error_description: "The code has expired or has been revoked." }))),
    null,
  );
  const cases: [FetchLike, RegExp][] = [
    [json(400, { error: "invalid_client" }), /400 error=invalid_client/],
    [json(400, { error: "invalid_request" }), /400 error=invalid_request/],
    [json(503, {}), /503/],
    [async () => new Response("<html>", { status: 502 }), /502/],
    [json(200, { access_token: "a1" }), /no refresh_token/],
    [json(200, { refresh_token: "" }), /no refresh_token/],
    [async () => new Response("not json", { status: 200 }), /no refresh_token/],
    [
      async () => {
        throw new TypeError("fetch failed");
      },
      /fetch failed/,
    ],
  ];
  for (const [f, re] of cases) {
    // 오류 메시지엔 상태·error 코드만 — client_secret·응답 본문(토큰)은 싣지 않는다
    await assert.rejects(exchangeAppleCode("c1", BUNDLE, opts(f)), (err: Error) => re.test(err.message) && !err.message.includes("SECRET-cs"));
  }
});

test("revoke — 200 이면 끝(주소·본문·타임아웃 신호), 아니면 상태·error 코드를 실어 throw", async () => {
  const calls: Call[] = [];
  const ok = fakeFetch(() => new Response("", { status: 200 }), calls);
  assert.equal(await revokeAppleToken("r1", BUNDLE, { clientSecret: "cs", fetchImpl: ok }), undefined);
  assert.equal(calls[0].url, REVOKE_URL);
  assert.equal(calls[0].hasSignal, true);
  assert.deepEqual(Object.fromEntries(calls[0].body), { client_id: BUNDLE, client_secret: "cs", token: "r1", token_type_hint: "refresh_token" });
  const cases: [FetchLike, RegExp][] = [
    [async () => new Response(JSON.stringify({ error: "invalid_client" }), { status: 400 }), /400 error=invalid_client/],
    [async () => new Response("<html>", { status: 503 }), /503 error=null/],
    [
      async () => {
        throw new TypeError("fetch failed");
      },
      /fetch failed/,
    ],
  ];
  for (const [f, re] of cases) {
    await assert.rejects(
      revokeAppleToken("r1", BUNDLE, { clientSecret: "SECRET-cs", fetchImpl: f }),
      (err: Error) => re.test(err.message) && !err.message.includes("SECRET-cs"),
    );
  }
});
