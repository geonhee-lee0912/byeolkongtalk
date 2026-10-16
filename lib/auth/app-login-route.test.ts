// 앱 로그인 라우트(app/api/auth/app/kakao · app/api/auth/app/apple)와 공용 모듈(lib/auth/app-route.ts)의 겉 동작을 잠근다(스펙 2026-10-12-앱-1 §7-3).
// ① 응답 모양 = 앱(mobile/src/auth/api.ts)이 읽는 계약 — 깨지면 이미 깔린 앱이 전부 로그인에 실패하고, 앱은 서버처럼 바로 고칠 수 없다
// ② 실패마다 상태 코드·로그 수준이 정해져 있고(본문 400 · 토큰 401 · 설정 503 · 장애 500), 실패면 가입(signIn)·토큰 발급까지 가지 않는다
// ③ 애플은 앱이 보낸 nonce 원본을 sha256 해서 대조하고, aud·교환 client_id 는 번들 ID, 리프레시 토큰은 암호화해서만 넘긴다
// 의존성은 resolve 훅으로 ./app-login-route.fakes.ts 로 바꿔 끼운다. signIn·토큰 발급·암호화·닉네임·속도 제한은 진짜다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import * as nodeModule from "node:module";
import { NextRequest } from "next/server";
import { verifyAccessToken } from "./app-token.ts";
import { hashSecretToken } from "./secret-token.ts";
import { decryptSecret } from "./token-crypto.ts";
import type * as Fakes from "./app-login-route.fakes.ts";

// 이 라우트 경로엔 실제 네트워크가 없어야 한다(카카오·애플·DB 는 전부 가짜) — 새 import 가 실서버로 새면 여기서 바로 드러난다
globalThis.fetch = (async (input: unknown) => {
  throw new Error(`app-login-route.test: 네트워크 호출 금지 — ${String(input)}`);
}) as typeof fetch;

const KAKAO_APP_ID = "1234567";
const BUNDLE_ID = "com.byeolkongtalk.app.dev";
process.env.KAKAO_APP_ID = KAKAO_APP_ID;
process.env.APPLE_BUNDLE_ID = BUNDLE_ID;
process.env.APP_ACCESS_TOKEN_SECRET = randomBytes(48).toString("base64");
process.env.APPLE_TOKEN_ENC_KEY = randomBytes(32).toString("base64");

// registerHooks 는 Node 22.15·23.5+ 에 있는데 설치된 @types/node(20) 엔 아직 타입이 없다 — 쓰는 모양만 선언한다.
type ResolveResult = { url: string; format?: string | null; shortCircuit?: boolean };
type RegisterHooks = (hooks: {
  resolve: (
    specifier: string,
    context: unknown,
    nextResolve: (specifier: string, context?: unknown) => ResolveResult,
  ) => ResolveResult;
}) => unknown;
const registerHooks = (nodeModule as unknown as { registerHooks?: RegisterHooks }).registerHooks;

const FAKES_URL = new URL("./app-login-route.fakes.ts", import.meta.url).href;
/** 어떤 지정자로 들어오든(@/lib/… · 상대 경로) 해석 결과가 이 파일들이면 가짜로 바꾼다 */
const FAKED = [
  "/lib/logger.ts",
  "/lib/auth/kakao-verify.ts",
  "/lib/auth/apple.ts",
  "/lib/auth/sign-in-deps.ts",
  "/lib/auth/app-session-store.ts",
];

type Handler = (request: NextRequest) => Promise<Response>;
type Routes = { kakao: Handler; apple: Handler; fakes: typeof Fakes };
let loaded: Promise<Routes> | null = null;
function load(): Promise<Routes> {
  loaded ??= (async () => {
    registerHooks!({
      resolve(specifier, context, nextResolve) {
        const r = nextResolve(specifier, context);
        return FAKED.some((suffix) => r.url.endsWith(suffix)) ? { ...r, url: FAKES_URL } : r;
      },
    });
    // 가짜 상태는 라우트가 받는 것과 같은 URL 로 불러야 같은 모듈 인스턴스다
    const fakes = (await import(FAKES_URL)) as typeof Fakes;
    const { POST: kakao } = await import("@/app/api/auth/app/kakao/route");
    const { POST: apple } = await import("@/app/api/auth/app/apple/route");
    return { kakao, apple, fakes };
  })();
  return loaded;
}

// 속도 제한(IP 당 분당 20회, 인스턴스 메모리)은 진짜다 — 테스트끼리 버킷이 섞이지 않게 요청마다 새 IP
let ipSeq = 0;
const nextIp = () => {
  ipSeq++;
  return `10.13.${Math.floor(ipSeq / 250)}.${(ipSeq % 250) + 1}`;
};
function post(path: string, body: unknown, opts: { ip?: string; raw?: string } = {}): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": opts.ip ?? nextIp() },
    body: opts.raw ?? JSON.stringify(body),
  });
}
const kakaoReq = (body: unknown, opts?: { ip?: string; raw?: string }) => post("/api/auth/app/kakao", body, opts);
const appleReq = (body: unknown, opts?: { ip?: string; raw?: string }) => post("/api/auth/app/apple", body, opts);

const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
const KAKAO_ID = "4123456789";
const APPLE_SUB = "001234.0a1b2c3d4e5f60718293a4b5c6d7e8f9.0123";
/** 앱이 만든 nonce 원본(mobile/src/auth/nativeLogin.ts — randomUUID). 애플엔 sha256 hex 를 넘겼다 */
const NONCE = "4f0c2b8e-3a1d-4c5e-9b7f-0123456789ab";
const appleBody = (over: Record<string, unknown> = {}) => ({
  identityToken: "apple-id-token",
  authorizationCode: "apple-code",
  nonce: NONCE,
  fullName: { givenName: "별콩", familyName: "김" },
  platform: "ios",
  ...over,
});

/** 로그인 성공 응답의 칸 — 더도 덜도 없이(내부 값 familyId 등이 새지 않게) */
const LOGIN_KEYS = ["accessExpiresAt", "accessExpiresIn", "accessToken", "handoffCode", "isNewUser", "refreshToken"];

/** 앱(mobile/src/auth/api.ts — tokensFrom·login)이 읽는 모양. 이 검사가 실패하면 앱은 bad_response 로 로그인에 실패한다 */
function assertAppReadable(body: Record<string, unknown>) {
  assert.deepEqual(Object.keys(body).sort(), LOGIN_KEYS);
  assert.equal(typeof body.accessToken, "string");
  assert.equal(typeof body.refreshToken, "string");
  assert.equal(typeof body.accessExpiresIn, "number");
  assert.equal(typeof body.handoffCode, "string");
  assert.equal(typeof body.isNewUser, "boolean");
}

/** 환경 변수를 잠깐 바꿔(undefined = 지움) fn 을 돌리고 되돌린다 */
async function withEnv<T>(name: string, value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const saved = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  }
}

// ───────────────────────── 카카오 ─────────────────────────

test("카카오 신규 회원 — 200 + 앱이 읽는 응답, 캐시 금지, 액세스 토큰은 그 회원, 리프레시·교환 코드는 해시만 저장(신규·플랫폼)", async () => {
  const { kakao, fakes } = await load();
  fakes.reset();
  const res = await kakao(kakaoReq({ accessToken: "kakao-at", platform: "ios" }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  const body = (await res.json()) as Record<string, unknown>;
  assertAppReadable(body);
  assert.equal(body.isNewUser, true);
  assert.equal(body.accessExpiresIn, 3600);
  assert.equal(await verifyAccessToken(body.accessToken as string), fakes.NEW_USER);
  assert.deepEqual(
    fakes.state.refreshRows.map((r) => ({ user_id: r.user_id, token_hash: r.token_hash, platform: r.platform })),
    [{ user_id: fakes.NEW_USER, token_hash: hashSecretToken(body.refreshToken as string), platform: "ios" }],
  );
  assert.deepEqual(
    fakes.state.handoffRows.map((r) => ({ user_id: r.user_id, code_hash: r.code_hash, is_new_user: r.is_new_user })),
    [{ user_id: fakes.NEW_USER, code_hash: hashSecretToken(body.handoffCode as string), is_new_user: true }],
  );
  assert.deepEqual(fakes.state.logs, []);
});

test("카카오 — KAKAO_APP_ID 로 확인하고, 카카오가 준 회원번호·닉네임·프로필을 그대로 가입에 넘긴다(웰컴 별 해시는 원장 공식, 로그 라벨·요청)", async () => {
  const { kakao, fakes } = await load();
  fakes.reset();
  const req = kakaoReq({ accessToken: "kakao-at", platform: "android" });
  await kakao(req);
  assert.deepEqual(fakes.state.kakaoCalls, [{ accessToken: "kakao-at", appId: KAKAO_APP_ID }]);
  assert.deepEqual(fakes.state.insertUsers, [{ kakao_id: Number(KAKAO_ID), nickname: "별콩", profile_img: "https://img.example/p.jpg" }]);
  assert.deepEqual(fakes.state.identityInserts, [
    { user_id: fakes.NEW_USER, provider: "kakao", provider_user_id: KAKAO_ID, apple_client_id: null, apple_refresh_token_enc: null },
  ]);
  assert.equal(fakes.state.newUserCalls, 1);
  assert.equal(fakes.state.newUserHash, sha256hex(KAKAO_ID));
  assert.equal(fakes.state.depsRoute, "/api/auth/app/kakao");
  assert.equal(fakes.state.depsRequest, req);
});

test("카카오 기존 회원 — isNewUser false, 교환 코드도 신규 아님, 닉네임·프로필 갱신, 신규 처리(웰컴 별) 안 부름", async () => {
  const { kakao, fakes } = await load();
  fakes.reset();
  fakes.state.existingUserId = fakes.OLD_USER;
  const res = await kakao(kakaoReq({ accessToken: "kakao-at", platform: "ios" }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  assertAppReadable(body);
  assert.equal(body.isNewUser, false);
  assert.equal(await verifyAccessToken(body.accessToken as string), fakes.OLD_USER);
  assert.deepEqual(fakes.state.handoffRows.map((r) => [r.user_id, r.is_new_user]), [[fakes.OLD_USER, false]]);
  assert.deepEqual(fakes.state.userUpdates, [{ userId: fakes.OLD_USER, patch: { nickname: "별콩", profile_img: "https://img.example/p.jpg" } }]);
  assert.deepEqual(fakes.state.insertUsers, []);
  assert.equal(fakes.state.newUserCalls, 0);
});

test("platform — ios·android 만 저장하고 그 밖(web·숫자·없음)은 null(표의 CHECK)", async () => {
  const { kakao, fakes } = await load();
  fakes.reset();
  for (const platform of ["ios", "android", "web", 1, undefined]) {
    assert.equal((await kakao(kakaoReq({ accessToken: "kakao-at", platform }))).status, 200);
  }
  assert.deepEqual(fakes.state.refreshRows.map((r) => r.platform), ["ios", "android", null, null, null]);
});

test("카카오 본문이 틀리면 400 invalid_request — 카카오에 묻지 않는다(JSON 아님·배열·토큰 없음·빈 문자열·문자열 아님)", async () => {
  const { kakao, fakes } = await load();
  fakes.reset();
  const bad = [kakaoReq(null, { raw: "not json" }), kakaoReq([]), kakaoReq({}), kakaoReq({ accessToken: "" }), kakaoReq({ accessToken: 12345 })];
  for (const req of bad) {
    const res = await kakao(req);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "invalid_request" });
  }
  assert.deepEqual(fakes.state.kakaoCalls, []);
  assert.deepEqual(fakes.state.logs, []);
});

test("KAKAO_APP_ID 가 없으면 503 not_configured + 오류 로그 — 카카오에 묻지 않고 가입도 안 한다", async () => {
  const { kakao, fakes } = await load();
  fakes.reset();
  const res = await withEnv("KAKAO_APP_ID", undefined, () => kakao(kakaoReq({ accessToken: "kakao-at" })));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "not_configured" });
  assert.deepEqual(fakes.state.logs.map((l) => [l.level, l.message, l.route]), [["error", "KAKAO_APP_ID not set", "/api/auth/app/kakao"]]);
  assert.deepEqual(fakes.state.kakaoCalls, []);
  assert.deepEqual(fakes.state.insertUsers, []);
});

test("카카오 토큰 무효 → 401(로그 없음) / 다른 카카오 앱 토큰 → 401 + 경고(tokenAppId) — 둘 다 가입·토큰 발급 없음", async () => {
  const { kakao, fakes } = await load();
  fakes.reset();
  fakes.state.kakao = { ok: false, reason: "token_invalid" };
  let res = await kakao(kakaoReq({ accessToken: "kakao-at" }));
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "invalid_token" });
  assert.deepEqual(fakes.state.logs, []);

  fakes.state.kakao = { ok: false, reason: "app_mismatch", appId: 7654321 };
  res = await kakao(kakaoReq({ accessToken: "kakao-at" }));
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "invalid_token" });
  assert.deepEqual(fakes.state.logs, [
    { level: "warn", message: "Kakao token from another app", route: "/api/auth/app/kakao", extra: { tokenAppId: 7654321 } },
  ]);
  assert.deepEqual(fakes.state.insertUsers, []);
  assert.deepEqual(fakes.state.refreshRows, []);
  assert.deepEqual(fakes.state.handoffRows, []);
});

test("카카오 장애(확인이 throw) → 500 internal + 오류 로그, 가입·토큰 발급 없음", async () => {
  const { kakao, fakes } = await load();
  fakes.reset();
  fakes.state.kakao = new Error("kakao 400 code=-7");
  const res = await kakao(kakaoReq({ accessToken: "kakao-at" }));
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal" });
  assert.deepEqual(fakes.state.logs.map((l) => [l.level, l.message, l.route]), [["error", "kakao 400 code=-7", "/api/auth/app/kakao"]]);
  assert.deepEqual(fakes.state.insertUsers, []);
  assert.deepEqual(fakes.state.refreshRows, []);
});

test("가입 실패(signIn ok:false) → 500 + 그 사유, 토큰·교환 코드 발급 없음(카카오·애플)", async () => {
  const { kakao, apple, fakes } = await load();
  for (const call of [() => kakao(kakaoReq({ accessToken: "kakao-at" })), () => apple(appleReq(appleBody()))]) {
    fakes.reset();
    fakes.state.insertUserResult = { ok: false, duplicate: false };
    const res = await call();
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "user_insert_failed" });
    assert.deepEqual(fakes.state.refreshRows, []);
    assert.deepEqual(fakes.state.handoffRows, []);
  }
});

test("토큰 저장 실패(DB 순간 오류) → 500 internal + 오류 로그 — 응답에 토큰이 실리지 않는다(카카오·애플)", async () => {
  const { kakao, apple, fakes } = await load();
  for (const call of [() => kakao(kakaoReq({ accessToken: "kakao-at" })), () => apple(appleReq(appleBody()))]) {
    fakes.reset();
    fakes.state.storeError = new Error("app_refresh_tokens insert failed");
    const res = await call();
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: "internal" });
    assert.deepEqual(fakes.state.logs.map((l) => [l.level, l.message]), [["error", "app_refresh_tokens insert failed"]]);
  }
});

test("카카오 속도 제한 — 같은 IP 21번째는 429 + Retry-After, 카카오에 묻지 않는다 / 다른 IP 는 통과", async () => {
  const { kakao, fakes } = await load();
  fakes.reset();
  const ip = nextIp();
  for (let i = 0; i < 20; i++) assert.equal((await kakao(kakaoReq({}, { ip }))).status, 400);
  const res = await kakao(kakaoReq({ accessToken: "kakao-at" }, { ip }));
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: "rate_limited" });
  const retryAfter = Number(res.headers.get("retry-after"));
  assert.ok(Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 60, `Retry-After=${retryAfter}`);
  assert.deepEqual(fakes.state.kakaoCalls, []);
  assert.equal((await kakao(kakaoReq({ accessToken: "kakao-at" }))).status, 200);
});

// ───────────────────────── 애플 ─────────────────────────

test("애플 신규 회원 — 번들 ID(aud)·sha256(nonce 원본)으로 확인, 인가 코드는 번들 ID 로 교환(redirect_uri 없음), 리프레시 토큰은 암호화해서만, 이름은 성+이름", async () => {
  const { apple, fakes } = await load();
  fakes.reset();
  const req = appleReq(appleBody());
  const res = await apple(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  const body = (await res.json()) as Record<string, unknown>;
  assertAppReadable(body);
  assert.equal(body.isNewUser, true);
  assert.equal(await verifyAccessToken(body.accessToken as string), fakes.NEW_USER);

  assert.deepEqual(fakes.state.appleCalls, [{ idToken: "apple-id-token", audience: BUNDLE_ID, expectedNonce: sha256hex(NONCE) }]);
  assert.deepEqual(fakes.state.exchangeCalls, [{ code: "apple-code", clientId: BUNDLE_ID, redirectUri: undefined }]);
  assert.deepEqual(fakes.state.insertUsers, [{ kakao_id: null, nickname: "김별콩", profile_img: null }]);
  const [identity] = fakes.state.identityInserts;
  assert.equal(identity.provider, "apple");
  assert.equal(identity.provider_user_id, APPLE_SUB);
  assert.equal(identity.apple_client_id, BUNDLE_ID);
  assert.ok(identity.apple_refresh_token_enc?.startsWith("v1:"));
  assert.ok(!identity.apple_refresh_token_enc?.includes("r0.apple-refresh-token"));
  assert.equal(decryptSecret(identity.apple_refresh_token_enc!), "r0.apple-refresh-token");
  assert.equal(fakes.state.newUserHash, sha256hex(`apple:${APPLE_SUB}`));
  assert.equal(fakes.state.depsRoute, "/api/auth/app/apple");
  assert.equal(fakes.state.depsRequest, req);
  assert.deepEqual(fakes.state.refreshRows.map((r) => r.platform), ["ios"]);
  assert.deepEqual(fakes.state.handoffRows.map((r) => [r.user_id, r.is_new_user]), [[fakes.NEW_USER, true]]);
  assert.deepEqual(fakes.state.logs, []);
});

test("애플 이름 — 한쪽만 있으면 그대로, 없거나 모양이 이상하면 별콩이_#### (null·문자열·배열·문자열 아닌 칸)", async () => {
  const { apple, fakes } = await load();
  fakes.reset();
  for (const fullName of [{ givenName: "별콩" }, null, "김별콩", ["김", "별콩"], { givenName: 1, familyName: { x: 1 } }]) {
    assert.equal((await apple(appleReq(appleBody({ fullName })))).status, 200);
  }
  const names = fakes.state.insertUsers.map((u) => u.nickname);
  assert.equal(names[0], "별콩");
  for (const n of names.slice(1)) assert.match(n, /^별콩이_\d{4}$/);
});

test("애플 기존 회원 — 새 리프레시 토큰으로 갈아 끼우고(번들 ID), 닉네임은 건드리지 않는다, 신규 처리 없음", async () => {
  const { apple, fakes } = await load();
  fakes.reset();
  fakes.state.existingUserId = fakes.OLD_USER;
  fakes.state.exchange = { refreshToken: "r1.newer" };
  const res = await apple(appleReq(appleBody({ fullName: { givenName: "다른", familyName: "이름" } })));
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as Record<string, unknown>).isNewUser, false);
  assert.deepEqual(fakes.state.userUpdates, [{ userId: fakes.OLD_USER, patch: {} }]);
  assert.equal(fakes.state.identityTouches.length, 1);
  const { provider, providerUserId, patch } = fakes.state.identityTouches[0];
  assert.deepEqual([provider, providerUserId, patch.apple_client_id], ["apple", APPLE_SUB, BUNDLE_ID]);
  assert.equal(decryptSecret(patch.apple_refresh_token_enc!), "r1.newer");
  assert.equal(fakes.state.newUserCalls, 0);
});

test("애플 본문이 틀리면 400 invalid_request — identityToken·nonce 중 하나라도 없거나 문자열이 아니면 애플에 묻지 않는다", async () => {
  const { apple, fakes } = await load();
  fakes.reset();
  const bad = [
    appleReq(null, { raw: "{" }),
    appleReq(appleBody({ identityToken: undefined })),
    appleReq(appleBody({ identityToken: "" })),
    appleReq(appleBody({ nonce: undefined })),
    appleReq(appleBody({ nonce: 42 })),
  ];
  for (const req of bad) {
    const res = await apple(req);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "invalid_request" });
  }
  assert.deepEqual(fakes.state.appleCalls, []);
  assert.deepEqual(fakes.state.exchangeCalls, []);
});

test("APPLE_BUNDLE_ID 가 없으면 503 not_configured + 오류 로그 — 애플에 묻지 않는다", async () => {
  const { apple, fakes } = await load();
  fakes.reset();
  const res = await withEnv("APPLE_BUNDLE_ID", undefined, () => apple(appleReq(appleBody())));
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "not_configured" });
  assert.deepEqual(fakes.state.logs.map((l) => [l.level, l.message, l.route]), [["error", "APPLE_BUNDLE_ID not set", "/api/auth/app/apple"]]);
  assert.deepEqual(fakes.state.appleCalls, []);
});

test("애플 토큰 무효 → 401(로그 없음) / 다른 클라이언트용 토큰 → 401 + 경고(tokenAud) — 둘 다 코드 교환·가입 없음", async () => {
  const { apple, fakes } = await load();
  fakes.reset();
  fakes.state.apple = { ok: false, reason: "token_invalid" };
  let res = await apple(appleReq(appleBody()));
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "invalid_token" });
  assert.deepEqual(fakes.state.logs, []);

  fakes.state.apple = { ok: false, reason: "aud_mismatch", aud: "com.byeolkongtalk.app" };
  res = await apple(appleReq(appleBody()));
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "invalid_token" });
  assert.deepEqual(fakes.state.logs, [
    { level: "warn", message: "Apple token for another client", route: "/api/auth/app/apple", extra: { tokenAud: "com.byeolkongtalk.app" } },
  ]);
  assert.deepEqual(fakes.state.exchangeCalls, []);
  assert.deepEqual(fakes.state.insertUsers, []);
  assert.deepEqual(fakes.state.refreshRows, []);
});

test("애플 공개키 조회 장애(확인이 throw) → 500 internal + 오류 로그, 코드 교환·가입 없음", async () => {
  const { apple, fakes } = await load();
  fakes.reset();
  fakes.state.apple = new Error("JWKS fetch timed out");
  const res = await apple(appleReq(appleBody()));
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal" });
  assert.deepEqual(fakes.state.logs.map((l) => [l.level, l.message, l.route]), [["error", "JWKS fetch timed out", "/api/auth/app/apple"]]);
  assert.deepEqual(fakes.state.exchangeCalls, []);
  assert.deepEqual(fakes.state.insertUsers, []);
});

test("인가 코드가 없거나 교환이 invalid_grant 면 경고만 남기고 로그인은 진행 — 리프레시 토큰 없이(기존 회원의 저장된 토큰은 지우지 않는다)", async () => {
  const { apple, fakes } = await load();
  fakes.reset();
  let res = await apple(appleReq(appleBody({ authorizationCode: undefined })));
  assert.equal(res.status, 200);
  assert.deepEqual(fakes.state.exchangeCalls, []);
  assert.deepEqual(fakes.state.logs.map((l) => [l.level, l.message]), [["warn", "Apple authorization code missing — no refresh token"]]);
  assert.equal(fakes.state.identityInserts[0].apple_refresh_token_enc, null);
  assert.equal(fakes.state.identityInserts[0].apple_client_id, BUNDLE_ID);

  fakes.reset();
  fakes.state.existingUserId = fakes.OLD_USER;
  fakes.state.exchange = null;
  res = await apple(appleReq(appleBody()));
  assert.equal(res.status, 200);
  assert.deepEqual(fakes.state.logs.map((l) => [l.level, l.message]), [["warn", "Apple code exchange rejected (invalid_grant) — no refresh token"]]);
  assert.deepEqual(fakes.state.identityTouches.map((t) => t.patch), [{}]);
});

test("교환 장애·설정 오류(invalid_client 등 throw)·암호화 키 없음 → 오류 로그(step apple_code_exchange), 로그인은 진행 — 토큰은 원문으로 남지 않는다", async () => {
  const { apple, fakes } = await load();
  fakes.reset();
  fakes.state.exchange = new Error("apple token 400 error=invalid_client");
  let res = await apple(appleReq(appleBody()));
  assert.equal(res.status, 200);
  assert.deepEqual(fakes.state.logs.map((l) => [l.level, l.message, l.extra.step]), [
    ["error", "apple token 400 error=invalid_client", "apple_code_exchange"],
  ]);
  assert.equal(fakes.state.identityInserts[0].apple_refresh_token_enc, null);

  fakes.reset();
  res = await withEnv("APPLE_TOKEN_ENC_KEY", undefined, () => apple(appleReq(appleBody())));
  assert.equal(res.status, 200);
  assert.equal(fakes.state.exchangeCalls.length, 1);
  assert.deepEqual(fakes.state.logs.map((l) => [l.level, l.message, l.extra.step]), [["error", "APPLE_TOKEN_ENC_KEY not set", "apple_code_exchange"]]);
  assert.equal(fakes.state.identityInserts[0].apple_refresh_token_enc, null);
});

test("애플 속도 제한 — 같은 IP 21번째는 429, 애플에 묻지 않는다", async () => {
  const { apple, fakes } = await load();
  fakes.reset();
  const ip = nextIp();
  for (let i = 0; i < 20; i++) assert.equal((await apple(appleReq({}, { ip }))).status, 400);
  const res = await apple(appleReq(appleBody(), { ip }));
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: "rate_limited" });
  assert.deepEqual(fakes.state.appleCalls, []);
});

// ───────────────────────── 공통 ─────────────────────────

test("APP_ACCESS_TOKEN_SECRET 이 없거나 32자 미만이면 두 라우트 모두 503 not_configured + 오류 로그 — 카카오·애플에 묻지도, 가입하지도 않는다", async () => {
  // 가입까지 가면 회원·웰컴 별·CAPI 는 생기고 토큰만 못 줘 500 이 난다(/api/health 는 '있다'만 봐서 짧은 값은 못 잡는다)
  const { kakao, apple, fakes } = await load();
  fakes.reset();
  for (const secret of [undefined, "x".repeat(31)]) {
    const responses = await withEnv("APP_ACCESS_TOKEN_SECRET", secret, async () => [
      await kakao(kakaoReq({ accessToken: "kakao-at" })),
      await apple(appleReq(appleBody())),
    ]);
    for (const res of responses) {
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: "not_configured" });
    }
  }
  assert.deepEqual(fakes.state.kakaoCalls, []);
  assert.deepEqual(fakes.state.appleCalls, []);
  assert.deepEqual(fakes.state.exchangeCalls, []);
  assert.deepEqual(fakes.state.insertUsers, []);
  assert.deepEqual(fakes.state.refreshRows, []);
  const logged = fakes.state.logs.map((l) => [l.level, l.message, l.route]);
  assert.deepEqual(logged, [
    ["error", "APP_ACCESS_TOKEN_SECRET not set or too short", "/api/auth/app/kakao"],
    ["error", "APP_ACCESS_TOKEN_SECRET not set or too short", "/api/auth/app/apple"],
    ["error", "APP_ACCESS_TOKEN_SECRET not set or too short", "/api/auth/app/kakao"],
    ["error", "APP_ACCESS_TOKEN_SECRET not set or too short", "/api/auth/app/apple"],
  ]);
});

// ───────────────────────── 본문 길이 상한 ─────────────────────────

test("본문 칸이 10,000자를 넘으면 없는 것으로 본다 — 토큰·nonce 는 400, 이름은 기본 닉네임(거대한 본문으로 서버 메모리·애플 호출을 쓰게 하지 않는다)", async () => {
  const { kakao, apple, fakes } = await load();
  fakes.reset();
  const long = "a".repeat(10_001);
  assert.equal((await kakao(kakaoReq({ accessToken: long }))).status, 400);
  assert.equal((await apple(appleReq(appleBody({ identityToken: long })))).status, 400);
  assert.equal((await apple(appleReq(appleBody({ nonce: long })))).status, 400);
  assert.deepEqual(fakes.state.kakaoCalls, []);
  assert.deepEqual(fakes.state.appleCalls, []);
  assert.equal((await apple(appleReq(appleBody({ fullName: { givenName: long, familyName: null } })))).status, 200);
  assert.match(fakes.state.insertUsers[0].nickname, /^별콩이_\d{4}$/);
  assert.equal((await apple(appleReq(appleBody({ authorizationCode: long })))).status, 200);
  assert.equal(fakes.state.exchangeCalls.length, 1); // 위 이름 요청의 정상 코드 1번만 — 거대한 코드는 애플에 보내지 않는다
});
