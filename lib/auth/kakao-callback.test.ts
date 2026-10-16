// 카카오 웹 콜백(app/api/auth/kakao/route.ts)의 겉 동작 — 안쪽을 signIn 으로 바꿔도 리다이렉트·쿠키·state·KOE320 처리가
// 그대로인지 잠근다(스펙 2026-10-12-앱-1 §12). 의존성은 resolve 훅으로 ./kakao-callback.fakes.ts 로 바꿔 끼운다.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { NextRequest } from "next/server";
import type * as Fakes from "./kakao-callback.fakes.ts";

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

test("신규 회원 — next 로 login=success&welcome=1, 세션 쿠키, state·acq 쿠키 정리, 신규 처리 1번", async () => {
  const { GET, fakes } = await load();
  fakes.reset();
  const res = await GET(callback({ code: "c1", state: `${NONCE}|/tarot/draw?resume=login` }));
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

test("기존 회원 — welcome 없이 login=success, 신규 처리(웰컴 별) 안 부름", async () => {
  const { GET, fakes } = await load();
  fakes.reset();
  fakes.state.existingUserId = "old-user";
  const loc = location(await GET(callback({ code: "c1", state: `${NONCE}|/` })));
  assert.equal(loc.searchParams.get("login"), "success");
  assert.equal(loc.searchParams.get("welcome"), null);
  assert.equal(fakes.state.cookieUserId, "old-user");
  assert.equal(fakes.state.newUserCalls, 0);
});

test("state 쿠키가 없으면 login=fail&reason=csrf_state_mismatch, 세션 쿠키 없음", async () => {
  const { GET, fakes } = await load();
  fakes.reset();
  const loc = location(await GET(callback({ code: "c1", state: `${NONCE}|/` }, "")));
  assert.equal(loc.pathname, "/");
  assert.equal(loc.searchParams.get("login"), "fail");
  assert.equal(loc.searchParams.get("reason"), "csrf_state_mismatch");
  assert.equal(fakes.state.cookieUserId, null);
});

test("KOE320(이미 쓴 인가 코드) — 실패 화면 없이 next 로, warn 1건, 세션 쿠키 없음", async () => {
  const { GET, fakes } = await load();
  fakes.reset();
  fakes.state.token = { error: "invalid_grant", error_code: "KOE320" };
  const loc = location(await GET(callback({ code: "c1", state: `${NONCE}|/fortune` })));
  assert.equal(loc.pathname, "/fortune");
  assert.equal(loc.searchParams.get("login"), null);
  assert.equal(fakes.state.warns.length, 1);
  assert.equal(fakes.state.cookieUserId, null);
});

test("그 밖의 토큰 실패 — login=fail&reason=token_failed", async () => {
  const { GET, fakes } = await load();
  fakes.reset();
  fakes.state.token = { error: "invalid_client" };
  const loc = location(await GET(callback({ code: "c1", state: `${NONCE}|/` })));
  assert.equal(loc.searchParams.get("reason"), "token_failed");
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
  assert.equal(fakes.state.newUserCalls, 0);
  assert.equal(fakes.state.errors.length, 1);
});
