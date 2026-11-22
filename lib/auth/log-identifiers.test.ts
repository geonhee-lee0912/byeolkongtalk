// 로그인 수단 식별자·해시·닉네임은 오류 로그(error_logs)와 콘솔 어디에도 남기지 않는다 —
// error_logs.user_id 는 탈퇴 때 NULL 이 되지만 message·context 는 남는다.
// 실제 sign-in-deps + 로거 + supabase-js 를 돌리고 그 아래 fetch 만 바꾼다: DB 오류의 details("Failing row contains …")는
// 로거가 오류 객체를 통째로 문자열로 만들 때 message 로 들어가므로 extra 만 봐서는 못 잡는다.
import { beforeEach, test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { NextRequest } from "next/server";
import { supabaseSignInDeps } from "./sign-in-deps.ts";
import { unlinkKakao } from "../kakao.ts";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://db.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.KAKAO_ADMIN_KEY = "test-admin-key";

const KAKAO_ID = 4123456789;
const APPLE_SUB = "001234.0a1b2c3d4e5f60718293a4b5c6d7e8f9.0123";
const NICKNAME = "가짜닉네임";
const HASH = "ab".repeat(32);
const USER_ID = "00000000-0000-4000-8000-000000000001";
const ROUTE = "/api/auth/kakao";
const SECRETS = [String(KAKAO_ID), APPLE_SUB, NICKNAME, HASH];

type Logged = { message: string; context: Record<string, unknown> | null; user_id: string | null };
let logged: Logged[];
let failure: { status: number; body: Record<string, unknown> };

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input).includes("/error_logs")) {
    logged.push(JSON.parse(String(init?.body)));
    return new Response(null, { status: 201 });
  }
  return Response.json(failure.body, { status: failure.status });
}) as typeof fetch;

/** 값이 실린 DB 오류 — Postgres 가 RLS 를 우회하는 역할(service_role)에게 돌려주는 모양 */
const dbError = (code: string) => ({
  status: 400,
  body: {
    code,
    message: `invalid value: "${NICKNAME}"`,
    details: `Failing row contains (${USER_ID}, ${SECRETS.join(", ")}).`,
    hint: null,
  },
});

function captureConsole(t: TestContext): () => string {
  const lines: string[] = [];
  for (const m of ["error", "warn", "info", "log"] as const) {
    t.mock.method(console, m, (...args: unknown[]) => void lines.push(inspect(args, { depth: 10 })));
  }
  return () => lines.join("\n");
}

function assertNoIdentifiers(output: string) {
  for (const s of SECRETS) assert.ok(!output.includes(s), `로그에 남았다: ${s}`);
}

const deps = () => supabaseSignInDeps(new NextRequest("http://localhost:3000/api/auth/kakao"), ROUTE);

beforeEach(() => {
  logged = [];
  failure = dbError("23502");
});

test("회원 만들기 실패 — 단계·DB 코드만 남는다", async (t) => {
  const output = captureConsole(t);
  const result = await deps().insertUser({ kakao_id: KAKAO_ID, nickname: NICKNAME, profile_img: null });
  assert.deepEqual(result, { ok: false, duplicate: false });
  assertNoIdentifiers(JSON.stringify(logged) + output());
  assert.equal(logged[0].message, "user insert failed (23502)");
  assert.deepEqual(logged[0].context, { step: "user_insert", dbCode: "23502" });
});

test("회원 만들기 중복 — 로그 없이 duplicate 로 돌려준다", async (t) => {
  const output = captureConsole(t);
  failure = dbError("23505");
  const result = await deps().insertUser({ kakao_id: KAKAO_ID, nickname: NICKNAME, profile_img: null });
  assert.deepEqual(result, { ok: false, duplicate: true });
  assert.deepEqual(logged, []);
  assert.equal(output(), "");
});

test("응답에 코드가 없는 실패(게이트웨이 등) — 본문 없이 단계만 남는다", async (t) => {
  const output = captureConsole(t);
  failure = { status: 502, body: { message: `upstream failed ${KAKAO_ID}` } };
  await deps().insertUser({ kakao_id: KAKAO_ID, nickname: NICKNAME, profile_img: null });
  assertNoIdentifiers(JSON.stringify(logged) + output());
  assert.equal(logged[0].message, "user insert failed (no code)");
  assert.deepEqual(logged[0].context, { step: "user_insert", dbCode: null });
});

test("로그인 수단 저장 실패 — 단계·수단·DB 코드만 남는다", async (t) => {
  const output = captureConsole(t);
  const result = await deps().insertIdentity({
    user_id: USER_ID,
    provider: "apple",
    provider_user_id: APPLE_SUB,
    apple_client_id: null,
    apple_refresh_token_enc: null,
  });
  assert.deepEqual(result, { ok: false, duplicate: false });
  assertNoIdentifiers(JSON.stringify(logged) + output());
  assert.equal(logged[0].message, "user identity insert failed (23502)");
  assert.equal(logged[0].user_id, USER_ID);
  assert.deepEqual(logged[0].context, { step: "user_identities_insert", provider: "apple", dbCode: "23502" });
});

test("로그인 수단 갱신 실패 — 단계·수단·DB 코드만 남는다", async (t) => {
  const output = captureConsole(t);
  await deps().updateIdentityOnLogin("apple", APPLE_SUB, {});
  assertNoIdentifiers(JSON.stringify(logged) + output());
  assert.equal(logged[0].message, "user identity update failed (23502)");
  assert.deepEqual(logged[0].context, { step: "user_identities_touch", provider: "apple", dbCode: "23502" });
});

test("웰컴 별 청구 실패 — 원장 해시 없이 DB 코드만 남는다", async (t) => {
  const output = captureConsole(t);
  await deps().onNewUser(USER_ID, HASH);
  assertNoIdentifiers(JSON.stringify(logged) + output());
  const entry = logged.find((l) => l.context?.severity === "WELCOME_CLAIM_CHECK_FAILED");
  assert.equal(entry?.message, "welcome claim failed (23502)");
  assert.deepEqual(entry?.context, { severity: "WELCOME_CLAIM_CHECK_FAILED", dbCode: "23502" });
});

test("카카오 연결 끊기 실패 — 콘솔엔 상태·코드만, 응답 본문은 찍지 않는다", async (t) => {
  const output = captureConsole(t);
  failure = { status: 400, body: { code: -2, msg: `invalid target_id ${KAKAO_ID}` } };
  const result = await unlinkKakao(KAKAO_ID);
  assert.deepEqual(result, { ok: false, alreadyUnlinked: false, status: 400, code: -2 });
  assertNoIdentifiers(output());
  assert.match(output(), /400/);
  assert.match(output(), /-2/);
});
