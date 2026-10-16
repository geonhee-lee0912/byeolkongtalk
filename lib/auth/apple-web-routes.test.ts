// 웹 애플 로그인 라우트(app/api/auth/login/apple · apple/callback · apple/complete)의 겉 동작을 잠근다(스펙 2026-10-12-앱-1 §7-5).
// ① CSRF·재사용 방지 — 판단은 complete 의 state 쿠키 nonce 일치 하나에 걸려 있다. callback 은 누가 POST 하든 같은 출처 POST 로 다시 보내므로
//    (Lax 쿠키가 실린다) SameSite 는 방어가 아니다 — state 확인을 빼거나 애플 error 처리 뒤로 미루면 여기서 걸린다
// ② 유입·CAPI — 가입 처리(signIn 의 deps)는 complete 가 받은 요청(acq·anon·_fbp 쿠키가 실린 같은 출처 POST)으로 돈다
// ③ 리다이렉트 — POST 에 대한 응답은 303, 목적지는 카카오 콜백과 같다(login=success·welcome=1 / loginFailRedirectUrl), 바깥 주소로는 못 간다
// ④ 애플 쪽 계약 — 인증 주소(form_post · code id_token · scope=name), id_token 의 aud=Services ID · nonce=sha256(쿠키 원본),
//    교환 redirect_uri = 시작 때 보낸 그 주소, 리프레시 토큰은 암호화해서만 남긴다
// 의존성은 resolve 훅으로 ./apple-web-routes.fakes.ts(애플 서버·DB 자리)로 바꿔 끼운다. signIn·암호화·세션 쿠키·next 거르기는 진짜다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import * as nodeModule from "node:module";
import { NextRequest } from "next/server";
import { identityHash } from "./identity-hash.ts";
import { decryptSecret } from "./token-crypto.ts";
import type * as Fakes from "./apple-web-routes.fakes.ts";

// 이 라우트 경로엔 실제 네트워크가 없어야 한다(애플·DB 는 전부 가짜) — 새 import 가 실서버로 새면 여기서 바로 드러난다
globalThis.fetch = (async (input: unknown) => {
  throw new Error(`apple-web-routes.test: 네트워크 호출 금지 — ${String(input)}`);
}) as typeof fetch;

const BASE = "http://localhost:3000";
const SERVICES_ID = "com.byeolkongtalk.web.test";
process.env.NEXT_PUBLIC_BASE_URL = BASE;
process.env.APPLE_SERVICES_ID = SERVICES_ID;
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

const FAKES_URL = new URL("./apple-web-routes.fakes.ts", import.meta.url).href;
/** 어떤 지정자로 들어오든(@/lib/… · 상대 경로) 해석 결과가 이 파일들이면 가짜로 바꾼다 */
const FAKED = ["/lib/logger.ts", "/lib/auth/apple.ts", "/lib/auth/sign-in-deps.ts", "/lib/auth/app-session-store.ts"];

type Routes = {
  start: (request: NextRequest) => Promise<Response>;
  callback: (request: NextRequest) => Promise<Response>;
  complete: (request: NextRequest) => Promise<Response>;
  fakes: typeof Fakes;
};
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
    const { GET: start } = await import("@/app/api/auth/login/apple/route");
    const { POST: callback } = await import("@/app/api/auth/apple/callback/route");
    const { POST: complete } = await import("@/app/api/auth/apple/complete/route");
    return { start, callback, complete, fakes };
  })();
  return loaded;
}

const ROUTE = "/api/auth/apple/complete";
const CALLBACK_URL = `${BASE}/api/auth/apple/callback`;
const N = "0123456789abcdef0123456789abcdef"; // 시작 라우트가 만드는 모양(32 hex)
const STATE_COOKIE = `byeolkong_apple_state=${N}`;
/** complete 에 같이 실려 오는 Lax 쿠키들 — 유입(acq)·익명(anon)·메타(_fbp) */
const SITE_COOKIES = "byeolkong_acq=%7B%22utm_source%22%3A%22meta%22%7D; byeolkong_anon_id=anon-1; _fbp=fb.1.1.2";
const USER_JSON = JSON.stringify({ name: { firstName: "별콩", lastName: "김" } });
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function form(path: string, fields: Record<string, string>, cookie?: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (cookie) headers.cookie = cookie;
  return new NextRequest(`${BASE}${path}`, { method: "POST", headers, body: new URLSearchParams(fields).toString() });
}
const completeReq = (fields: Record<string, string>, cookie: string | undefined = `${STATE_COOKIE}; ${SITE_COOKIES}`) =>
  form(ROUTE, fields, cookie);
const callbackReq = (fields: Record<string, string>) => form("/api/auth/apple/callback", fields);
/** 애플이 돌려주는 정상 폼(첫 로그인 — user 포함) */
const good = (over: Record<string, string> = {}) => ({
  state: `${N}|/tarot/draw?resume=login`,
  code: "c1",
  id_token: "apple-id-token",
  user: USER_JSON,
  ...over,
});

const location = (res: Response) => new URL(res.headers.get("location")!);
const setCookie = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
/** 남은 로그 [수준, 메시지, 라우트] — state.logs 를 직접 deepEqual 하면 TS 가 그 뒤 줄에서 never[] 로 좁힌다 */
const logLines = (f: typeof Fakes) => f.state.logs.map((l) => [l.level, l.message, l.route]);

/** 콜백 페이지의 hidden 입력 → 브라우저가 제출할 값(escapeHtml 이 쓰는 5개 문자 참조만 되돌린다) */
function hiddenFields(html: string): Record<string, string> {
  const ENT: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
  const unescape = (s: string) => s.replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ENT[m]);
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<input type="hidden" name="([^"]*)" value="([^"]*)">/g)) out[unescape(m[1])] = unescape(m[2]);
  return out;
}

/** 실패 리다이렉트 공통 — 303, login=fail&reason, 세션 쿠키 없음, state 쿠키는 지운다(1회용) */
function assertFail(res: Response, reason: string, pathname = "/tarot/draw") {
  assert.equal(res.status, 303);
  const loc = location(res);
  assert.equal(loc.origin, BASE);
  assert.equal(loc.pathname, pathname);
  assert.equal(loc.searchParams.get("login"), "fail");
  assert.equal(loc.searchParams.get("reason"), reason);
  assert.equal(setCookie(res, "byeolkong_user_id"), undefined);
  assert.match(setCookie(res, "byeolkong_apple_state") ?? "", /^byeolkong_apple_state=;.*Max-Age=0/i);
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

// ───────────────────────── 시작 (login/apple) ─────────────────────────

test("시작 — 애플 인증 주소(form_post · code id_token · scope=name · 돌아올 주소)로 307, state = 쿠키 nonce|next, 애플 nonce = sha256(쿠키 nonce)", async () => {
  const { start } = await load();
  const res = await start(new NextRequest(`${BASE}/api/auth/login/apple?next=${encodeURIComponent("/tarot/draw?resume=login")}`));
  assert.equal(res.status, 307);
  const raw = res.headers.get("location")!;
  const u = new URL(raw);
  assert.equal(`${u.origin}${u.pathname}`, "https://appleid.apple.com/auth/authorize");
  assert.equal(u.searchParams.get("client_id"), SERVICES_ID);
  assert.equal(u.searchParams.get("redirect_uri"), CALLBACK_URL);
  assert.equal(u.searchParams.get("response_type"), "code id_token");
  assert.equal(u.searchParams.get("response_mode"), "form_post");
  assert.equal(u.searchParams.get("scope"), "name");
  const cookie = setCookie(res, "byeolkong_apple_state")!;
  const nonce = /^byeolkong_apple_state=([^;]*)/.exec(cookie)![1];
  assert.match(nonce, /^[0-9a-f]{32}$/);
  assert.equal(u.searchParams.get("state"), `${nonce}|/tarot/draw?resume=login`);
  assert.equal(u.searchParams.get("nonce"), sha(nonce));
  // 다른 쿠키처럼 Lax(교차 사이트 form_post 엔 안 실린다 — 그래서 complete 가 같은 출처 POST 로 받는다) · 5분 · JS 에서 못 읽음
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=lax/i);
  assert.match(cookie, /; Path=\/;/);
  assert.match(cookie, /Max-Age=300/);
  assert.doesNotMatch(cookie, /Secure/i); // 로컬(production 아님)
});

test("시작 — production 이면 state 쿠키에 Secure, 호출마다 새 nonce", async () => {
  const { start } = await load();
  const nonces = new Set<string>();
  await withEnv("NODE_ENV", "production", async () => {
    for (let i = 0; i < 2; i++) {
      const cookie = setCookie(await start(new NextRequest(`${BASE}/api/auth/login/apple`)), "byeolkong_apple_state")!;
      assert.match(cookie, /Secure/i);
      nonces.add(/^byeolkong_apple_state=([^;]*)/.exec(cookie)![1]);
    }
  });
  assert.equal(nonces.size, 2);
});

test("시작 — next 가 바깥 주소면 state 의 next 는 '/'(open redirect 차단)", async () => {
  const { start } = await load();
  for (const evil of ["//evil.example/x", "https://evil.example", "/\\evil.example"]) {
    const res = await start(new NextRequest(`${BASE}/api/auth/login/apple?next=${encodeURIComponent(evil)}`));
    assert.match(new URL(res.headers.get("location")!).searchParams.get("state")!, /^[0-9a-f]{32}\|\/$/, evil);
  }
});

test("시작 — Services ID 가 없으면 애플로 가지 않고 login=fail&reason=apple_not_configured(뽑기 이어가기면 그 화면), state 쿠키 없음", async () => {
  const { start } = await load();
  await withEnv("APPLE_SERVICES_ID", undefined, async () => {
    const res = await start(new NextRequest(`${BASE}/api/auth/login/apple?next=${encodeURIComponent("/tarot/draw?resume=login")}`));
    assert.equal(res.status, 307);
    assert.equal(res.headers.get("location"), `${BASE}/tarot/draw?resume=login&login=fail&reason=apple_not_configured`);
    assert.equal(setCookie(res, "byeolkong_apple_state"), undefined);
  });
});

// ───────────────────────── 콜백 (apple/callback) ─────────────────────────

test("콜백 — 판단 없이 애플 5칸을 같은 출처 complete 로 다시 보내는 페이지(200 · HTML · 캐시 금지 · 리퍼러는 같은 출처만), 쿠키를 건드리지 않는다", async () => {
  const { callback, fakes } = await load();
  fakes.reset();
  const res = await callback(callbackReq({ ...good(), error: "e1", evil: "injected" }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "no-store");
  // no-referrer 면 자동 제출 POST 의 Origin 이 'null' 이 된다 — 같은 출처엔 보내고 교차 출처엔 안 보낸다
  assert.equal(res.headers.get("referrer-policy"), "same-origin");
  assert.deepEqual(res.headers.getSetCookie(), []);
  const html = await res.text();
  assert.match(html, /<form method="post" action="\/api\/auth\/apple\/complete">/);
  assert.deepEqual(hiddenFields(html), { ...good(), error: "e1" }); // 모르는 칸(evil)은 버린다
  // 스크립트는 자동 제출 하나뿐. 스크립트가 막혀도(CSP) 출구 버튼이 보이게 <noscript> 밖에 둔다
  assert.equal((html.match(/<script>/g) ?? []).length, 1);
  assert.match(html, /<button type="submit">[^<]+<\/button><\/form>/);
  assert.doesNotMatch(html, /<noscript>/);
  // 스크립트가 돌면 버튼을 먼저 숨기고 제출한다(응답을 기다리는 동안 두 번 누르지 않게)
  assert.match(html, /<script>[^<]*\.hidden=true;[^<]*\.submit\(\)<\/script>/);
  // 판단·가입은 complete 몫 — 콜백은 아무것도 부르지 않는다
  assert.equal(fakes.state.appleCalls.length, 0);
  assert.equal(fakes.state.depsRoute, null);
});

test("콜백 — 값의 따옴표·꺾쇠·&·작은따옴표를 이스케이프해 태그를 못 깨고, 브라우저가 되돌린 값은 원래 값과 같다", async () => {
  const { callback } = await load();
  const tricky = {
    user: `{"name":{"firstName":"\\"><script>alert(1)</script>","lastName":"O'Brien & <b> &lt;i&gt;"}}`,
    state: `${N}|/a?b=1&c="2"&d='3'`,
    id_token: "a.b-c_d",
    code: "c&d<e>",
    error: `x" onfocus="alert(1)`,
  };
  const html = await (await callback(callbackReq(tricky))).text();
  assert.ok(!html.includes("<script>alert(1)"));
  assert.ok(!html.includes(`" onfocus=`));
  assert.ok(!html.includes("<b>"));
  assert.deepEqual(hiddenFields(html), tricky);
  // 값 칸 안엔 날것의 < > ' 가 없고, & 는 전부 문자 참조의 시작이다 — 원문의 '&lt;' 같은 글자를 브라우저가 '<' 로 바꿔 값이 변하지 않게
  for (const m of html.matchAll(/ value="([^"]*)"/g)) {
    assert.doesNotMatch(m[1], /[<>']/);
    assert.doesNotMatch(m[1], /&(?!(?:amp|lt|gt|quot|#39);)/);
  }
});

test("콜백 — 1만 자 넘는 값은 버리고(1만 자는 통과), 폼이 아닌 본문이어도 throw 없이 200(칸 0개)", async () => {
  const { callback } = await load();
  let html = await (await callback(callbackReq({ state: "s1", id_token: "x".repeat(10_001), code: "y".repeat(10_000) }))).text();
  assert.deepEqual(Object.keys(hiddenFields(html)).sort(), ["code", "state"]);
  const bodies: [string, string][] = [
    ["{not form", "application/json"],
    ["", "application/x-www-form-urlencoded"],
  ];
  for (const [body, ct] of bodies) {
    const res = await callback(new NextRequest(CALLBACK_URL, { method: "POST", body, headers: { "content-type": ct } }));
    assert.equal(res.status, 200);
    html = await res.text();
    assert.deepEqual(hiddenFields(html), {});
  }
});

// ───────────────────────── 시작 → 애플 → 콜백 → 마무리 (한 줄로) ─────────────────────────

test("한 줄 흐름 — 시작이 준 쿠키·state 로 애플이 콜백에 보낸 폼을 콜백 페이지 그대로 제출하면 로그인되고, 애플 nonce·교환 주소가 서로 맞물린다", async () => {
  const { start, callback, complete, fakes } = await load();
  fakes.reset();
  const s = await start(new NextRequest(`${BASE}/api/auth/login/apple?next=${encodeURIComponent("/fortune")}`));
  const authorize = new URL(s.headers.get("location")!);
  const stateCookie = setCookie(s, "byeolkong_apple_state")!.split(";")[0];
  // 애플 → 콜백: 교차 사이트 POST 라 쿠키가 없다
  const page = await (await callback(callbackReq({ state: authorize.searchParams.get("state")!, code: "c9", id_token: "tok9", user: USER_JSON }))).text();
  // 콜백 페이지 → complete: 같은 출처 POST 라 Lax 쿠키가 실린다
  const req = completeReq(hiddenFields(page), `${stateCookie}; ${SITE_COOKIES}`);
  const res = await complete(req);
  assert.equal(res.status, 303);
  assert.equal(location(res).pathname, "/fortune");
  assert.equal(location(res).searchParams.get("login"), "success");
  assert.deepEqual(fakes.state.appleCalls, [{ idToken: "tok9", audience: SERVICES_ID, expectedNonce: authorize.searchParams.get("nonce")! }]);
  assert.deepEqual(fakes.state.exchangeCalls, [{ code: "c9", clientId: SERVICES_ID, redirectUri: authorize.searchParams.get("redirect_uri")! }]);
  assert.equal(fakes.state.insertUsers[0].nickname, "김별콩");
  assert.equal(fakes.state.depsRequest, req);
});

// ───────────────────────── 마무리 (apple/complete) — 성공 ─────────────────────────

test("신규 회원 — 303 으로 next?login=success&welcome=1, 세션 쿠키, state·acq 쿠키 정리, 신규 처리 1번(애플 원장 해시)", async () => {
  const { complete, fakes } = await load();
  fakes.reset();
  const res = await complete(completeReq(good()));
  assert.equal(res.status, 303);
  const loc = location(res);
  assert.equal(loc.origin, BASE);
  assert.equal(loc.pathname, "/tarot/draw");
  assert.equal(loc.searchParams.get("resume"), "login");
  assert.equal(loc.searchParams.get("login"), "success");
  assert.equal(loc.searchParams.get("welcome"), "1");
  const session = setCookie(res, "byeolkong_user_id")!;
  assert.match(session, new RegExp(`^byeolkong_user_id=${fakes.NEW_USER};`));
  assert.match(session, /HttpOnly/i);
  assert.match(session, /SameSite=lax/i);
  assert.match(setCookie(res, "byeolkong_apple_state") ?? "", /^byeolkong_apple_state=;.*Max-Age=0/i);
  assert.match(setCookie(res, "byeolkong_acq") ?? "", /^byeolkong_acq=;.*Max-Age=0/i);
  assert.equal(fakes.state.newUserCalls, 1);
  assert.equal(fakes.state.newUserHash, identityHash("apple", fakes.APPLE_SUB));
  assert.deepEqual(logLines(fakes), []);
});

test("신규 회원 — 유입·CAPI 를 읽을 요청은 complete 가 받은 그 요청(같은 출처라 acq·anon·_fbp 가 실려 있다), 로그 라벨은 이 라우트", async () => {
  const { complete, fakes } = await load();
  fakes.reset();
  const req = completeReq(good());
  await complete(req);
  assert.equal(fakes.state.depsRequest, req);
  assert.equal(fakes.state.depsRoute, ROUTE);
  const cookies = (fakes.state.depsRequest as NextRequest).cookies;
  assert.equal(cookies.get("byeolkong_anon_id")?.value, "anon-1");
  assert.equal(cookies.get("_fbp")?.value, "fb.1.1.2");
  assert.ok(cookies.get("byeolkong_acq"));
});

test("신규 회원 — id_token 확인은 aud=Services ID · nonce=sha256(쿠키 원본), 교환은 Services ID + 시작 때 보낸 돌아올 주소, 회원·로그인 수단 행", async () => {
  const { complete, fakes } = await load();
  fakes.reset();
  await complete(completeReq(good()));
  assert.deepEqual(fakes.state.appleCalls, [{ idToken: "apple-id-token", audience: SERVICES_ID, expectedNonce: sha(N) }]);
  assert.deepEqual(fakes.state.exchangeCalls, [{ code: "c1", clientId: SERVICES_ID, redirectUri: CALLBACK_URL }]);
  assert.deepEqual(fakes.state.insertUsers, [{ kakao_id: null, nickname: "김별콩", profile_img: null }]);
  assert.equal(fakes.state.identityInserts.length, 1);
  const row = fakes.state.identityInserts[0];
  assert.equal(row.user_id, fakes.NEW_USER);
  assert.equal(row.provider, "apple");
  assert.equal(row.provider_user_id, fakes.APPLE_SUB);
  assert.equal(row.apple_client_id, SERVICES_ID);
  // 리프레시 토큰은 암호화해서만 — 원문이 행에 남지 않는다
  assert.ok(row.apple_refresh_token_enc && !row.apple_refresh_token_enc.includes("r0.apple-refresh-token"));
  assert.equal(decryptSecret(row.apple_refresh_token_enc), "r0.apple-refresh-token");
});

test("user 필드 — 애플은 첫 로그인 때만 이름을 준다: 없거나 이상하면 별콩이_NNNN", async () => {
  const { complete, fakes } = await load();
  for (const user of ["", "not json", '{"email":"x@y.z"}', '{"name":"str"}']) {
    fakes.reset();
    await complete(completeReq(good({ user })));
    assert.match(fakes.state.insertUsers[0].nickname, /^별콩이_\d{4}$/, user);
  }
});

test("기존 회원 — welcome 없이 login=success, 신규 처리·회원 만들기 없음, 닉네임은 그대로(애플은 이름을 안 바꾼다), 새 리프레시 토큰으로 갈아 끼운다", async () => {
  const { complete, fakes } = await load();
  fakes.reset();
  fakes.state.existingUserId = fakes.OLD_USER;
  const res = await complete(completeReq(good()));
  assert.equal(res.status, 303);
  assert.equal(location(res).searchParams.get("login"), "success");
  assert.equal(location(res).searchParams.get("welcome"), null);
  assert.match(setCookie(res, "byeolkong_user_id")!, new RegExp(`^byeolkong_user_id=${fakes.OLD_USER};`));
  assert.equal(fakes.state.newUserCalls, 0);
  assert.deepEqual(fakes.state.insertUsers, []);
  assert.deepEqual(fakes.state.userUpdates, [{ userId: fakes.OLD_USER, patch: {} }]);
  assert.equal(fakes.state.identityTouches.length, 1);
  const patch = fakes.state.identityTouches[0].patch;
  assert.equal(patch.apple_client_id, SERVICES_ID);
  assert.equal(decryptSecret(patch.apple_refresh_token_enc!), "r0.apple-refresh-token");
});

test("교환 실패(invalid_grant)·code 없음 — 로그인은 진행, 리프레시 토큰 없이(기존 토큰은 지우지 않는다), warn 1건", async () => {
  const { complete, fakes } = await load();
  fakes.reset();
  fakes.state.exchange = null;
  let res = await complete(completeReq(good()));
  assert.equal(location(res).searchParams.get("login"), "success");
  assert.equal(fakes.state.identityInserts[0].apple_refresh_token_enc, null);
  assert.deepEqual(logLines(fakes), [["warn", "Apple code exchange rejected (invalid_grant) — no refresh token", ROUTE]]);

  fakes.reset();
  fakes.state.existingUserId = fakes.OLD_USER;
  res = await complete(completeReq(good({ code: "" })));
  assert.equal(location(res).searchParams.get("login"), "success");
  assert.deepEqual(fakes.state.exchangeCalls, []);
  assert.deepEqual(fakes.state.identityTouches[0].patch, {});
  assert.deepEqual(logLines(fakes), [["warn", "Apple authorization code missing — no refresh token", ROUTE]]);
});

test("교환 장애(invalid_client·애플 5xx·타임아웃) — 로그인은 진행, error 1건(step apple_code_exchange)", async () => {
  const { complete, fakes } = await load();
  fakes.reset();
  fakes.state.exchange = new Error("apple token 400 error=invalid_client");
  const res = await complete(completeReq(good()));
  assert.equal(location(res).searchParams.get("login"), "success");
  assert.deepEqual(logLines(fakes), [["error", "apple token 400 error=invalid_client", ROUTE]]);
  assert.equal(fakes.state.logs[0].extra.step, "apple_code_exchange");
});

// ───────────────────────── 마무리 — CSRF · 실패 ─────────────────────────

test("state 쿠키가 없으면(다른 사이트가 직접 POST) csrf_state_mismatch — 확인·교환·가입을 하나도 부르지 않는다", async () => {
  const { complete, fakes } = await load();
  fakes.reset();
  const res = await complete(completeReq(good(), SITE_COOKIES));
  assertFail(res, "csrf_state_mismatch");
  assert.equal(fakes.state.appleCalls.length, 0);
  assert.equal(fakes.state.exchangeCalls.length, 0);
  assert.equal(fakes.state.depsRoute, null);
});

test("callback 을 거친 위조 — 쿠키는 실려 와도(같은 출처 자동 제출) nonce 가 다르거나 32자가 아니거나 비었으면 csrf_state_mismatch", async () => {
  const { callback, complete, fakes } = await load();
  const cases: [string, string][] = [
    [`${"b".repeat(32)}|/tarot/draw`, STATE_COOKIE], // 공격자는 피해자의 nonce 를 모른다
    [`${"c".repeat(31)}|/tarot/draw`, `byeolkong_apple_state=${"c".repeat(31)}`],
    [`|/tarot/draw`, "byeolkong_apple_state="],
    ["", STATE_COOKIE],
  ];
  for (const [state, cookie] of cases) {
    fakes.reset();
    const page = await (await callback(callbackReq(good({ state })))).text();
    const res = await complete(completeReq(hiddenFields(page), `${cookie}; ${SITE_COOKIES}`));
    assertFail(res, "csrf_state_mismatch", state.includes("/tarot/draw") ? "/tarot/draw" : "/");
    assert.equal(fakes.state.appleCalls.length, 0, state);
    assert.equal(fakes.state.depsRoute, null, state);
  }
});

test("애플 error(사용자 취소 등) — state 확인을 먼저 한다: 쿠키가 없으면 csrf_state_mismatch, 맞으면 그 사유(64자까지)", async () => {
  const { complete, fakes } = await load();
  fakes.reset();
  assertFail(await complete(completeReq({ state: good().state, error: "user_cancelled_authorize" }, SITE_COOKIES)), "csrf_state_mismatch");
  assertFail(await complete(completeReq({ state: good().state, error: "user_cancelled_authorize" })), "user_cancelled_authorize");
  const res = await complete(completeReq({ state: good().state, error: "e".repeat(200) }));
  assert.equal(location(res).searchParams.get("reason"), "e".repeat(64));
  assert.equal(fakes.state.appleCalls.length, 0);
});

test("id_token 없음 → no_code, Services ID 없음 → apple_not_configured — 둘 다 확인 전에 멈춘다", async () => {
  const { complete, fakes } = await load();
  fakes.reset();
  assertFail(await complete(completeReq(good({ id_token: "" }))), "no_code");
  await withEnv("APPLE_SERVICES_ID", undefined, async () => {
    assertFail(await complete(completeReq(good())), "apple_not_configured");
  });
  assert.equal(fakes.state.appleCalls.length, 0);
});

test("id_token 무효 → invalid_token, 교환·가입 안 부름, 로그 없음(아무 문자열로도 닿는다)", async () => {
  const { complete, fakes } = await load();
  fakes.reset();
  fakes.state.apple = { ok: false, reason: "token_invalid" };
  assertFail(await complete(completeReq(good())), "invalid_token");
  assert.equal(fakes.state.exchangeCalls.length, 0);
  assert.equal(fakes.state.depsRoute, null);
  assert.deepEqual(logLines(fakes), []);
});

test("다른 클라이언트용 진짜 토큰(aud_mismatch) → invalid_token + warn(tokenAud) — APPLE_SERVICES_ID 설정 실수 신호", async () => {
  const { complete, fakes } = await load();
  fakes.reset();
  fakes.state.apple = { ok: false, reason: "aud_mismatch", aud: "com.byeolkongtalk.app" };
  assertFail(await complete(completeReq(good())), "invalid_token");
  assert.deepEqual(logLines(fakes), [["warn", "Apple token for another client", ROUTE]]);
  assert.deepEqual(fakes.state.logs[0].extra, { tokenAud: "com.byeolkongtalk.app" });
  assert.equal(fakes.state.exchangeCalls.length, 0);
});

test("애플 공개키 장애(확인이 throw) → internal + error 1건, 교환·가입 안 부름", async () => {
  const { complete, fakes } = await load();
  fakes.reset();
  fakes.state.apple = new Error("JWKS timeout");
  assertFail(await complete(completeReq(good())), "internal");
  assert.deepEqual(logLines(fakes), [["error", "JWKS timeout", ROUTE]]);
  assert.equal(fakes.state.exchangeCalls.length, 0);
  assert.equal(fakes.state.depsRoute, null);
});

test("회원 만들기 실패 → user_insert_failed, DB 장애(throw) → internal + error — 둘 다 세션 쿠키·신규 처리 없음", async () => {
  const { complete, fakes } = await load();
  fakes.reset();
  fakes.state.insertUserResult = { ok: false, duplicate: false };
  assertFail(await complete(completeReq(good())), "user_insert_failed");
  assert.equal(fakes.state.newUserCalls, 0);

  fakes.reset();
  fakes.state.insertUserResult = new Error("db down");
  assertFail(await complete(completeReq(good())), "internal");
  assert.deepEqual(logLines(fakes), [["error", "db down", ROUTE]]);
  assert.equal(fakes.state.newUserCalls, 0);
});

test("실패 목적지 — 뽑기 이어가기(/tarot/draw…)만 그 화면으로, 그 밖은 홈", async () => {
  const { complete, fakes } = await load();
  fakes.reset();
  fakes.state.apple = { ok: false, reason: "token_invalid" };
  assertFail(await complete(completeReq(good({ state: `${N}|/fortune` }))), "invalid_token", "/");
});

test("open redirect — state 의 next 가 바깥 주소면 성공·실패 모두 우리 출처의 홈으로", async () => {
  const { complete, fakes } = await load();
  for (const evil of ["//evil.example/x", "https://evil.example", "/\\evil.example", "javascript:alert(1)"]) {
    fakes.reset();
    let loc = location(await complete(completeReq(good({ state: `${N}|${evil}` }))));
    assert.equal(`${loc.origin}${loc.pathname}`, `${BASE}/`, evil);
    assert.equal(loc.searchParams.get("login"), "success", evil);
    fakes.state.apple = { ok: false, reason: "token_invalid" };
    loc = location(await complete(completeReq(good({ state: `${N}|${evil}` }))));
    assert.equal(`${loc.origin}${loc.pathname}`, `${BASE}/`, evil);
  }
});

test("state 는 첫 '|' 로만 가른다 — next 에 '|' 가 있어도 nonce 는 앞 32자", async () => {
  const { complete, fakes } = await load();
  fakes.reset();
  const loc = location(await complete(completeReq(good({ state: `${N}|/fortune?x=a|b` }))));
  assert.equal(loc.pathname, "/fortune");
  assert.equal(loc.searchParams.get("x"), "a|b");
  assert.equal(loc.searchParams.get("login"), "success");
});

test("본문이 폼이 아니면 throw 없이 csrf_state_mismatch", async () => {
  const { complete, fakes } = await load();
  fakes.reset();
  const res = await complete(
    new NextRequest(`${BASE}${ROUTE}`, { method: "POST", body: "{}", headers: { "content-type": "application/json", cookie: STATE_COOKIE } }),
  );
  assertFail(res, "csrf_state_mismatch", "/");
});
