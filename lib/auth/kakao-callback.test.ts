// 카카오 웹 콜백(app/api/auth/kakao/route.ts)의 겉 동작 — 안쪽을 signIn 으로 바꿔도 리다이렉트·쿠키·state·KOE320 처리가
// 그대로인지 잠근다(스펙 2026-10-12-앱-1 §12). 의존성은 resolve 훅으로 ./kakao-callback.fakes.ts 로 바꿔 끼운다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as nodeModule from "node:module";
import { NextRequest } from "next/server";
import type * as Fakes from "./kakao-callback.fakes.ts";

// 이 라우트 경로엔 실제 네트워크가 없어야 한다(카카오·DB 는 전부 가짜) — 새 import 가 실서버·DB 로 새면 여기서 바로 드러난다
globalThis.fetch = (async (input: unknown) => {
  throw new Error(`kakao-callback.test: 네트워크 호출 금지 — ${String(input)}`);
}) as typeof fetch;

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

const FAKES_URL = new URL("./kakao-callback.fakes.ts", import.meta.url).href;
/** 어떤 지정자로 들어오든(@/lib/… · 상대 경로) 해석 결과가 이 파일들이면 가짜로 바꾼다 */
const FAKED = ["/lib/kakao.ts", "/lib/session.ts", "/lib/logger.ts", "/lib/auth/sign-in-deps.ts"];

type Route = { GET: (request: NextRequest) => Promise<Response>; fakes: typeof Fakes };
let loaded: Promise<Route> | null = null;
function load(): Promise<Route> {
  loaded ??= (async () => {
    registerHooks!({
      resolve(specifier, context, nextResolve) {
        const r = nextResolve(specifier, context);
        return FAKED.some((suffix) => r.url.endsWith(suffix)) ? { ...r, url: FAKES_URL } : r;
      },
    });
    // 가짜 상태는 라우트가 받는 것과 같은 URL 로 불러야 같은 모듈 인스턴스다
    const fakes = (await import(FAKES_URL)) as typeof Fakes;
    const { GET } = await import("@/app/api/auth/kakao/route");
    return { GET, fakes };
  })();
  return loaded;
}

const NONCE = "a".repeat(32);
function callback(params: Record<string, string>, cookie = `byeolkong_oauth_state=${NONCE}`): NextRequest {
  const u = new URL("http://localhost:3000/api/auth/kakao");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new NextRequest(u, { headers: cookie ? { cookie } : {} });
}
const location = (res: Response) => new URL(res.headers.get("location")!);
const setCookies = (res: Response) => res.headers.getSetCookie().join("\n");
/** 웰컴 별 원장(bonus_claims)에 이미 쌓여 있는 카카오 공식 — 바뀌면 탈퇴→재가입이 웰컴 별을 또 받는다 */
const ledgerHash = (kakaoId: number) => createHash("sha256").update(String(kakaoId)).digest("hex");

test("신규 회원 — next 로 login=success&welcome=1, 세션 쿠키, state·acq 쿠키 정리, 신규 처리 1번", async () => {
  const { GET, fakes } = await load();
  fakes.reset();
  const req = callback({ code: "c1", state: `${NONCE}|/tarot/draw?resume=login` });
  const res = await GET(req);
  const loc = location(res);
  assert.equal(loc.origin, "http://localhost:3000");
  assert.equal(loc.pathname, "/tarot/draw");
  assert.equal(loc.searchParams.get("resume"), "login");
  assert.equal(loc.searchParams.get("login"), "success");
  assert.equal(loc.searchParams.get("welcome"), "1");
  assert.equal(fakes.state.cookieUserId, "new-user");
  assert.equal(fakes.state.newUserCalls, 1);
  assert.match(setCookies(res), /byeolkong_oauth_state=;/);
  assert.match(setCookies(res), /byeolkong_acq=;/);
});

test("신규 회원 — 카카오 회원번호·닉네임·프로필을 그대로 넘기고, 웰컴 별 해시는 원장 공식, 유입·CAPI 는 이 요청에서 읽는다", async () => {
  const { GET, fakes } = await load();
  fakes.reset();
  const req = callback({ code: "c1", state: `${NONCE}|/` });
  await GET(req);
  assert.deepEqual(fakes.state.lastInsertUser, {
    kakao_id: 4123456789,
    nickname: "별콩",
    profile_img: "https://img.example/p.jpg",
  });
  assert.equal(fakes.state.newUserHash, ledgerHash(4123456789));
  assert.equal(fakes.state.depsRoute, "/api/auth/kakao");
  assert.equal(fakes.state.depsRequest, req);
});

test("카카오 프로필이 비어 있으면 닉네임 별콩이_{회원번호}, 프로필 null", async () => {
  const { GET, fakes } = await load();
  fakes.reset();
  fakes.state.user = { id: 4123456789 };
  await GET(callback({ code: "c1", state: `${NONCE}|/` }));
  assert.deepEqual(fakes.state.lastInsertUser, { kakao_id: 4123456789, nickname: "별콩이_4123456789", profile_img: null });
});

test("기존 회원 — welcome 없이 login=success, 닉네임·프로필 갱신, 신규 처리(웰컴 별) 안 부름", async () => {
  const { GET, fakes } = await load();
  fakes.reset();
  fakes.state.existingUserId = "old-user";
  const loc = location(await GET(callback({ code: "c1", state: `${NONCE}|/` })));
  assert.equal(loc.searchParams.get("login"), "success");
  assert.equal(loc.searchParams.get("welcome"), null);
  assert.equal(fakes.state.cookieUserId, "old-user");
  assert.deepEqual(fakes.state.lastUserUpdate, {
    userId: "old-user",
    patch: { nickname: "별콩", profile_img: "https://img.example/p.jpg" },
  });
  assert.equal(fakes.state.lastInsertUser, null);
  assert.equal(fakes.state.newUserCalls, 0);
});

test("회원 만들기 실패 — login=fail&reason=user_insert_failed(뽑기 이어가기면 그 화면으로), 세션 쿠키 없음, state 쿠키 정리, 신규 처리 없음", async () => {
  const { GET, fakes } = await load();
  fakes.reset();
  fakes.state.insertUserResult = { ok: false, duplicate: false };
  const res = await GET(callback({ code: "c1", state: `${NONCE}|/tarot/draw?resume=login` }));
  const loc = location(res);
  assert.equal(loc.pathname, "/tarot/draw");
  assert.equal(loc.searchParams.get("resume"), "login");
  assert.equal(loc.searchParams.get("login"), "fail");
  assert.equal(loc.searchParams.get("reason"), "user_insert_failed");
  assert.equal(fakes.state.cookieUserId, null);
  assert.equal(fakes.state.newUserCalls, 0);
  assert.match(setCookies(res), /byeolkong_oauth_state=;/);
});

test("state 쿠키가 없으면 login=fail&reason=csrf_state_mismatch, 세션 쿠키 없음, state 쿠키 정리", async () => {
  const { GET, fakes } = await load();
  fakes.reset();
  const res = await GET(callback({ code: "c1", state: `${NONCE}|/` }, ""));
  const loc = location(res);
  assert.equal(loc.pathname, "/");
  assert.equal(loc.searchParams.get("login"), "fail");
  assert.equal(loc.searchParams.get("reason"), "csrf_state_mismatch");
  assert.equal(fakes.state.cookieUserId, null);
  assert.match(setCookies(res), /byeolkong_oauth_state=;/);
});

test("state 쿠키와 nonce 가 다르거나 32자가 아니면 csrf_state_mismatch, 세션 쿠키 없음", async () => {
  const { GET, fakes } = await load();
  for (const [stateNonce, cookieNonce] of [
    [NONCE, "b".repeat(32)],
    ["abc", "abc"],
  ]) {
    fakes.reset();
    const loc = location(await GET(callback({ code: "c1", state: `${stateNonce}|/` }, `byeolkong_oauth_state=${cookieNonce}`)));
    assert.equal(loc.searchParams.get("reason"), "csrf_state_mismatch", stateNonce);
    assert.equal(fakes.state.cookieUserId, null);
  }
});

// 카카오 동의 화면에서 취소하면 code 없이 error=access_denied 로 온다 — scripts/entry-ab-daily-check.sql 이 이 reason 을 센다
test("카카오에서 취소(error=access_denied) — login=fail&reason=access_denied, 세션 쿠키 없음", async () => {
  const { GET, fakes } = await load();
  fakes.reset();
  const loc = location(await GET(callback({ error: "access_denied", state: `${NONCE}|/` })));
  assert.equal(loc.searchParams.get("login"), "fail");
  assert.equal(loc.searchParams.get("reason"), "access_denied");
  assert.equal(fakes.state.cookieUserId, null);
});

test("KOE320(이미 쓴 인가 코드) — 실패 화면 없이 next 로, warn 1건, 세션 쿠키 없음, state 쿠키 정리", async () => {
  const { GET, fakes } = await load();
  fakes.reset();
  fakes.state.token = { error: "invalid_grant", error_code: "KOE320" };
  const res = await GET(callback({ code: "c1", state: `${NONCE}|/fortune` }));
  const loc = location(res);
  assert.equal(loc.pathname, "/fortune");
  assert.equal(loc.searchParams.get("login"), null);
  assert.equal(fakes.state.warns.length, 1);
  assert.equal(fakes.state.errors.length, 0);
  assert.equal(fakes.state.cookieUserId, null);
  assert.match(setCookies(res), /byeolkong_oauth_state=;/);
});

test("그 밖의 토큰 실패 — login=fail&reason=token_failed, 오류 로그 1건", async () => {
  const { GET, fakes } = await load();
  fakes.reset();
  fakes.state.token = { error: "invalid_client" };
  const loc = location(await GET(callback({ code: "c1", state: `${NONCE}|/` })));
  assert.equal(loc.searchParams.get("reason"), "token_failed");
  assert.equal(fakes.state.errors.length, 1);
});

test("next 가 바깥 주소면 홈으로(open redirect 차단)", async () => {
  const { GET, fakes } = await load();
  fakes.reset();
  const loc = location(await GET(callback({ code: "c1", state: `${NONCE}|//evil.example/x` })));
  assert.equal(loc.origin, "http://localhost:3000");
  assert.equal(loc.pathname, "/");
});

// lib/kakao.ts 의 getKakaoUser 는 응답 상태를 보지 않는다 — 실패 응답이면 id 가 없어 'undefined' 가 signIn 으로 간다.
// signIn 이 DB 전에 throw 해서 회원이 생기지 않고 internal 로 끝나야 한다(sign-in.test.ts 의 회원번호 검사).
test("카카오 사용자 조회 실패(id 없음) — login=fail&reason=internal, 세션 쿠키 없음, 회원 생성 없음", async () => {
  const { GET, fakes } = await load();
  fakes.reset();
  fakes.state.user = { msg: "this access token does not exist", code: -401 };
  const loc = location(await GET(callback({ code: "c1", state: `${NONCE}|/` })));
  assert.equal(loc.searchParams.get("login"), "fail");
  assert.equal(loc.searchParams.get("reason"), "internal");
  assert.equal(fakes.state.cookieUserId, null);
  assert.equal(fakes.state.lastInsertUser, null);
  assert.equal(fakes.state.newUserCalls, 0);
  assert.equal(fakes.state.errors.length, 1);
});
