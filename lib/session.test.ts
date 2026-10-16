// getSession 연결부 — Authorization 헤더를 읽어 토큰을 검증하고 session-resolve 규칙에 넘기는지 잠근다(스펙 2026-10-12-앱-1 §7-4).
// 규칙 자체는 lib/auth/session-resolve.test.ts 가 본다. 쿠키 폴백을 '친절하게' 되살리는 자리는 이 연결부다
// (hasBearer 를 '토큰이 통과했나'로 바꾸기, 토큰 실패 때 쿠키 값을 넘기기 등 — 순수 함수 테스트는 그대로 통과한다).
// next/headers 는 resolve 훅으로 ./session.fakes.ts 로 바꿔 끼우고, 토큰은 실제 서명(app-token)으로 만든다.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { signAccessToken } from "./auth/app-token.ts";
import type * as Fakes from "./session.fakes.ts";

process.env.APP_ACCESS_TOKEN_SECRET = "s".repeat(40);

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

const FAKES_URL = new URL("./session.fakes.ts", import.meta.url).href;

type Mod = { getSession: typeof import("./session.ts").getSession; fakes: typeof Fakes };
let loaded: Promise<Mod> | null = null;
function load(): Promise<Mod> {
  loaded ??= (async () => {
    registerHooks!({
      resolve(specifier, context, nextResolve) {
        const r = nextResolve(specifier, context);
        // next/headers 만 가짜로 — 원래 파일은 CommonJS 라 결과의 url 만 바꾸지 않고 가짜 파일을 새로 해석한다
        return r.url.endsWith("/node_modules/next/headers.js") ? nextResolve(FAKES_URL, context) : r;
      },
    });
    // 가짜 상태는 getSession 이 받는 것과 같은 URL 로 불러야 같은 모듈 인스턴스다
    const fakes = (await import(FAKES_URL)) as typeof Fakes;
    const { getSession } = await import("./session.ts");
    return { getSession, fakes };
  })();
  return loaded;
}

const A = "2f1c7a3e-1b2c-4d5e-8f90-1234567890ab";
const B = "9a8b7c6d-1b2c-4d5e-8f90-1234567890ab";
const ANON = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";

test("유효한 Bearer — 토큰의 회원(쿠키가 다른 회원이어도) · 익명 쿠키도 안 본다", async () => {
  const { getSession, fakes } = await load();
  const { token } = await signAccessToken(A);
  fakes.setRequest({ authorization: `Bearer ${token}`, cookies: { byeolkong_user_id: B, byeolkong_anon_id: ANON } });
  const s = await getSession();
  assert.equal(s.userId, A);
  assert.equal(s.anonymousId, null);
  assert.equal(s.isAuthenticated, true);
});

test("만료·다른 비밀값·위조 Bearer — 유효한 쿠키가 있어도 비로그인이고 게스트(anon)로도 넘어가지 않는다", async () => {
  const { getSession, fakes } = await load();
  const expired = (await signAccessToken(A, { nowSec: Math.floor(Date.now() / 1000) - 7200 })).token;
  const otherKey = (await signAccessToken(A, { secret: "t".repeat(40) })).token;
  for (const token of [expired, otherKey, "not.a.token"]) {
    fakes.setRequest({ authorization: `Bearer ${token}`, cookies: { byeolkong_user_id: B, byeolkong_anon_id: ANON } });
    const s = await getSession();
    assert.equal(s.userId, null, token);
    assert.equal(s.anonymousId, null, token);
    assert.equal(s.isAuthenticated, false, token);
  }
});

test("토큰이 비었거나 형식이 틀린 Bearer 도 비로그인 — 앱이 토큰을 붙이다 실패한 게 쿠키로 가려지지 않게", async () => {
  const { getSession, fakes } = await load();
  for (const authorization of ["Bearer", "Bearer ", "bearer", "Bearer a b"]) {
    fakes.setRequest({ authorization, cookies: { byeolkong_user_id: B, byeolkong_anon_id: ANON } });
    const s = await getSession();
    assert.equal(s.userId, null, JSON.stringify(authorization));
    assert.equal(s.anonymousId, null, JSON.stringify(authorization));
  }
});

test("Authorization 이 없거나 Bearer 방식이 아니면 지금처럼 쿠키 — UUID 형식만 받는다", async () => {
  const { getSession, fakes } = await load();
  for (const authorization of [undefined, "Basic dXNlcjpwYXNz"]) {
    fakes.setRequest({ authorization, cookies: { byeolkong_user_id: B, byeolkong_anon_id: ANON } });
    const s = await getSession();
    assert.equal(s.userId, B, String(authorization));
    assert.equal(s.anonymousId, ANON);
    assert.equal(s.isAuthenticated, true);
  }
  fakes.setRequest({ cookies: { byeolkong_user_id: "x,y" } });
  assert.equal((await getSession()).userId, null);
});
