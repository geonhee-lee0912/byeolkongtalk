// 앱 토큰 라우트(app/api/auth/app/refresh · handoff-code · logout · handoff · reset)의 겉 동작을 잠근다(스펙 2026-10-12-앱-1 §7-4).
// ① 응답 모양 = 현장의 앱(mobile/src/auth/api.ts — tokensFrom·handoffCode)이 읽는 계약. 갱신 응답 모양이 깨지면 서버는 옛 토큰을 이미 교체했는데
//    앱은 새 토큰을 저장하지 못해, 다음 실행 때 옛 토큰이 '재사용'으로 판정되고 그 기기들이 전부 로그아웃된다(앱은 서버처럼 바로 못 고친다)
// ② 앱은 401 + 본문 error 가 invalid·reused 일 때만 '이 기기 로그인은 끝났다'로 읽고(기기 토큰을 지운다) 429·500·503 이면 토큰을 지킨다(Task 23 isAuthError) — 상태 코드와 본문 코드가 곧 앱 동작이다
// ③ 교환 코드는 Bearer 로만 발급하고(쿠키 세션으로는 안 된다), 토큰·코드 원문은 로그에 남지 않으며, 무효 코드는 로그를 남기지 않는다
// handoff 의 앱 UA 관문·헤더 코드는 app-handoff-route.test.ts 가 따로 잠근다.
// 의존성은 resolve 훅으로 ./app-token-routes.fakes.ts(메모리 표 + 로그)로 바꿔 끼운다. 토큰 교체·서명·속도 제한·쿠키는 진짜다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import * as nodeModule from "node:module";
import { NextRequest } from "next/server";
import { HANDOFF_CODE_HEADER } from "@/lib/app-bridge/protocol";
import { createHandoffCode, issueAppTokens } from "./app-session.ts";
import { signAccessToken, verifyAccessToken } from "./app-token.ts";
import { hashSecretToken } from "./secret-token.ts";
import type * as Fakes from "./app-token-routes.fakes.ts";

// 이 라우트 경로엔 실제 네트워크가 없어야 한다(DB 는 가짜) — 새 import 가 실서버로 새면 여기서 바로 드러난다
globalThis.fetch = (async (input: unknown) => {
  throw new Error(`app-token-routes.test: 네트워크 호출 금지 — ${String(input)}`);
}) as typeof fetch;

const BASE = "http://localhost:3000";
process.env.NEXT_PUBLIC_BASE_URL = BASE;
process.env.APP_ACCESS_TOKEN_SECRET = randomBytes(48).toString("base64");

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

const FAKES_URL = new URL("./app-token-routes.fakes.ts", import.meta.url).href;
/** 어떤 지정자로 들어오든(@/lib/… · 상대 경로) 해석 결과가 이 파일들이면 가짜로 바꾼다 */
const FAKED = ["/lib/logger.ts", "/lib/auth/app-session-store.ts"];

type Handler = (request: NextRequest) => Promise<Response>;
type Routes = { refresh: Handler; handoffCode: Handler; logout: Handler; handoff: Handler; reset: Handler; fakes: typeof Fakes };
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
    const { POST: refresh } = await import("@/app/api/auth/app/refresh/route");
    const { POST: handoffCode } = await import("@/app/api/auth/app/handoff-code/route");
    const { POST: logout } = await import("@/app/api/auth/app/logout/route");
    const { GET: handoff } = await import("@/app/api/auth/app/handoff/route");
    const { GET: reset } = await import("@/app/api/auth/app/reset/route");
    return { refresh, handoffCode, logout, handoff, reset, fakes };
  })();
  return loaded;
}

const USER = "2f1c7a3e-1b2c-4d5e-8f90-1234567890ab";
const R_REFRESH = "/api/auth/app/refresh";
const R_HANDOFF_CODE = "/api/auth/app/handoff-code";
const R_LOGOUT = "/api/auth/app/logout";
const R_HANDOFF = "/api/auth/app/handoff";
const APP_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 ByeolkongApp/1.0.0 (android)";
const SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

/** 갱신 응답의 칸 — 앱(api.ts tokensFrom)이 읽는 accessToken·refreshToken·accessExpiresIn + 기록용 accessExpiresAt. 묶음 ID·회원 ID 가 새지 않게 더도 덜도 없이 */
const REFRESH_KEYS = ["accessExpiresAt", "accessExpiresIn", "accessToken", "refreshToken"];

// 속도 제한(IP 당 분당 30회, 인스턴스 메모리)은 진짜다 — 테스트끼리 버킷이 섞이지 않게 요청마다 새 IP
let ipSeq = 0;
const nextIp = () => {
  ipSeq++;
  return `10.15.${Math.floor(ipSeq / 250)}.${(ipSeq % 250) + 1}`;
};
function postJson(path: string, body: unknown, opts: { ip?: string; raw?: string } = {}): NextRequest {
  return new NextRequest(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": opts.ip ?? nextIp() },
    body: opts.raw ?? JSON.stringify(body),
  });
}
const refreshReq = (body: unknown, opts?: { ip?: string; raw?: string }) => postJson(R_REFRESH, body, opts);
const logoutReq = (body: unknown, opts?: { ip?: string; raw?: string }) => postJson(R_LOGOUT, body, opts);
function codeReq(headers: Record<string, string> = {}, ip?: string): NextRequest {
  return new NextRequest(`${BASE}${R_HANDOFF_CODE}`, { method: "POST", headers: { "x-forwarded-for": ip ?? nextIp(), ...headers } });
}
/** 앱 웹뷰가 여는 모양 — 코드는 헤더(HANDOFF_CODE_HEADER)로 */
function handoffReq(query: string, code?: string, ua = APP_UA): NextRequest {
  const headers: Record<string, string> = { "user-agent": ua };
  if (code !== undefined) headers[HANDOFF_CODE_HEADER] = code;
  return new NextRequest(`${BASE}${R_HANDOFF}?${query}`, { headers });
}
const resetReq = (query: string, ua: string) => new NextRequest(`${BASE}/api/auth/app/reset?${query}`, { headers: { "user-agent": ua } });

const redirectTo = (res: Response) => new URL(res.headers.get("location")!);
const setCookie = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
/** 남은 로그 [수준, 메시지, 라우트] — state.logs 를 직접 deepEqual 하면 TS 가 그 뒤 줄에서 never[] 로 좁힌다 */
const logLines = (f: typeof Fakes) => f.state.logs.map((l) => [l.level, l.message, l.route]);
const bearer = async (opts: { secret?: string; nowSec?: number } = {}) => `Bearer ${(await signAccessToken(USER, opts)).token}`;

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

// ───────────────────────── 갱신 (refresh) ─────────────────────────

test("갱신 — 200 + 앱이 읽는 4칸(더도 덜도 없이), 캐시·리퍼러 금지, 새 액세스 토큰은 그 회원, 새 리프레시 토큰은 같은 묶음에 해시로만·옛 토큰은 교체 표시", async () => {
  const { refresh, fakes } = await load();
  fakes.reset();
  const t = await issueAppTokens(fakes.supabaseAppSessionStore(), USER, "ios");
  const res = await refresh(refreshReq({ refreshToken: t.refreshToken }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  const body = (await res.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), REFRESH_KEYS);
  assert.equal(typeof body.accessToken, "string");
  assert.equal(typeof body.refreshToken, "string");
  assert.equal(typeof body.accessExpiresAt, "number");
  assert.equal(body.accessExpiresIn, 3600);
  assert.equal(await verifyAccessToken(body.accessToken as string), USER);
  assert.notEqual(body.refreshToken, t.refreshToken);
  const [old, rotated] = fakes.state.refresh;
  assert.ok(old.rotated_at);
  assert.deepEqual(
    { token_hash: rotated.token_hash, family_id: rotated.family_id, platform: rotated.platform },
    { token_hash: hashSecretToken(body.refreshToken as string), family_id: t.familyId, platform: "ios" },
  );
  assert.deepEqual(logLines(fakes), []);
});

test("갱신 거절은 전부 401 invalid(앱이 기기 토큰을 지운다) — 본문이 틀리면 DB 에 묻지도 않고, 모르는 토큰은 로그 없이", async () => {
  const { refresh, fakes } = await load();
  fakes.reset();
  const bad = [
    refreshReq(null, { raw: "not json" }),
    refreshReq([]),
    refreshReq({}),
    refreshReq({ refreshToken: "" }),
    refreshReq({ refreshToken: 42 }),
    refreshReq({ refreshToken: "a".repeat(10_001) }),
  ];
  for (const req of bad) {
    const res = await refresh(req);
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "invalid" });
  }
  assert.deepEqual(fakes.state.calls, []);
  const res = await refresh(refreshReq({ refreshToken: "nope" }));
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "invalid" });
  assert.deepEqual(fakes.state.calls, ["claimRefresh", "findRefresh"]);
  assert.deepEqual(logLines(fakes), []);
});

test("재사용 — 교체 10초 안의 같은 토큰은 401 invalid(경고·폐기 없음), 10초 뒤면 401 reused + 경고 1건(원문 없음)·그 묶음 전체 폐기, 다른 기기는 그대로", async () => {
  const { refresh, fakes } = await load();
  fakes.reset();
  const store = fakes.supabaseAppSessionStore();
  const phone = await issueAppTokens(store, USER, "ios");
  const tablet = await issueAppTokens(store, USER, "android");
  const r1 = await refresh(refreshReq({ refreshToken: phone.refreshToken }));
  assert.equal(r1.status, 200);
  const latest = ((await r1.json()) as { refreshToken: string }).refreshToken;

  const dup = await refresh(refreshReq({ refreshToken: phone.refreshToken }));
  assert.equal(dup.status, 401);
  assert.deepEqual(await dup.json(), { error: "invalid" });
  assert.deepEqual(logLines(fakes), []);

  // 교체가 11초 전이었던 것으로 돌린다(라우트는 서버 시계를 쓴다)
  fakes.state.refresh.find((r) => r.token_hash === hashSecretToken(phone.refreshToken))!.rotated_at = new Date(Date.now() - 11_000).toISOString();
  const reuse = await refresh(refreshReq({ refreshToken: phone.refreshToken }));
  assert.equal(reuse.status, 401);
  assert.deepEqual(await reuse.json(), { error: "reused" });
  assert.deepEqual(logLines(fakes), [
    ["warn", "App refresh token reused — device family revoked", R_REFRESH],
  ]);
  const logged = JSON.stringify(fakes.state.logs);
  for (const secret of [phone.refreshToken, latest, hashSecretToken(phone.refreshToken)]) assert.ok(!logged.includes(secret));

  const afterRevoke = await refresh(refreshReq({ refreshToken: latest }));
  assert.equal(afterRevoke.status, 401);
  assert.deepEqual(await afterRevoke.json(), { error: "invalid" });
  assert.equal(fakes.state.logs.length, 1); // 폐기된 묶음은 또 세지 않는다
  assert.equal((await refresh(refreshReq({ refreshToken: tablet.refreshToken }))).status, 200);
});

test("갱신 중 DB 오류는 500 internal + 오류 로그(앱은 토큰을 지킨다) — 401 로 접지 않는다, 옛 토큰은 되살아나 다음 시도가 성공한다", async () => {
  const { refresh, fakes } = await load();
  fakes.reset();
  const t = await issueAppTokens(fakes.supabaseAppSessionStore(), USER, "android");
  for (const failOn of ["claimRefresh", "insertRefresh"] as const) {
    fakes.state.failOn = failOn;
    const res = await refresh(refreshReq({ refreshToken: t.refreshToken }));
    assert.equal(res.status, 500, failOn);
    assert.deepEqual(await res.json(), { error: "internal" });
  }
  fakes.state.failOn = "findRefresh";
  const unknown = await refresh(refreshReq({ refreshToken: "nope" }));
  assert.equal(unknown.status, 500);
  assert.deepEqual(logLines(fakes), [
    ["error", "db blip: claimRefresh", R_REFRESH],
    ["error", "db blip: insertRefresh", R_REFRESH],
    ["error", "db blip: findRefresh", R_REFRESH],
  ]);
  fakes.state.failOn = null;
  const retry = await refresh(refreshReq({ refreshToken: t.refreshToken }));
  assert.equal(retry.status, 200);
  assert.equal(fakes.state.logs.length, 3); // 가짜 '재사용' 경고 없음
  assert.ok(!JSON.stringify(fakes.state.logs).includes(t.refreshToken));
});

test("서명 비밀값이 없거나 32자 미만이면 503 not_configured + 오류 로그 — 옛 토큰을 claim 하지 않는다(DB 호출 0), 고치면 그대로 이어진다", async () => {
  const { refresh, fakes } = await load();
  fakes.reset();
  const t = await issueAppTokens(fakes.supabaseAppSessionStore(), USER, "ios");
  fakes.state.calls.length = 0;
  for (const secret of [undefined, "x".repeat(31)]) {
    const res = await withEnv("APP_ACCESS_TOKEN_SECRET", secret, () => refresh(refreshReq({ refreshToken: t.refreshToken })));
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "not_configured" });
  }
  assert.deepEqual(fakes.state.calls, []);
  assert.deepEqual(logLines(fakes), [
    ["error", "APP_ACCESS_TOKEN_SECRET not set or too short", R_REFRESH],
    ["error", "APP_ACCESS_TOKEN_SECRET not set or too short", R_REFRESH],
  ]);
  assert.equal((await refresh(refreshReq({ refreshToken: t.refreshToken }))).status, 200);
});

test("갱신 속도 제한 — 같은 IP 31번째는 429 + Retry-After(앱은 토큰을 지킨다), 토큰을 claim 하지 않는다 / 다른 IP 는 통과", async () => {
  const { refresh, fakes } = await load();
  fakes.reset();
  const t = await issueAppTokens(fakes.supabaseAppSessionStore(), USER, "ios");
  fakes.state.calls.length = 0;
  const ip = nextIp();
  for (let i = 0; i < 30; i++) assert.equal((await refresh(refreshReq({}, { ip }))).status, 401);
  const res = await refresh(refreshReq({ refreshToken: t.refreshToken }, { ip }));
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: "rate_limited" });
  const retryAfter = Number(res.headers.get("retry-after"));
  assert.ok(Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 60, `Retry-After=${retryAfter}`);
  assert.deepEqual(fakes.state.calls, []);
  assert.equal((await refresh(refreshReq({ refreshToken: t.refreshToken }))).status, 200);
});

// ───────────────────────── 교환 코드 발급 (handoff-code) ─────────────────────────

test("교환 코드 발급 — Bearer(앱 액세스 토큰)면 200 + {handoffCode} 한 칸, 캐시·리퍼러 금지, 표엔 해시만(그 회원·신규 아님·60초)", async () => {
  const { handoffCode, fakes } = await load();
  fakes.reset();
  const before = Date.now();
  const res = await handoffCode(codeReq({ authorization: await bearer() }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  const body = (await res.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body), ["handoffCode"]);
  assert.match(body.handoffCode as string, /^[A-Za-z0-9_-]{43}$/);
  const [row] = fakes.state.handoff;
  assert.deepEqual(
    { code_hash: row.code_hash, user_id: row.user_id, is_new_user: row.is_new_user, n: fakes.state.handoff.length },
    { code_hash: hashSecretToken(body.handoffCode as string), user_id: USER, is_new_user: false, n: 1 },
  );
  const ttl = Date.parse(row.expires_at) - before;
  assert.ok(ttl >= 60_000 && ttl < 65_000, `ttl=${ttl}`);
  assert.deepEqual(logLines(fakes), []);
});

test("교환 코드는 Bearer 로만 — 쿠키 세션·헤더 없음·빈/틀린 Bearer·다른 방식·위조(다른 비밀값)·만료 토큰은 401 unauthorized, 코드를 만들지 않는다", async () => {
  const { handoffCode, fakes } = await load();
  fakes.reset();
  const good = await bearer();
  const cases: Record<string, string>[] = [
    {},
    { cookie: `byeolkong_user_id=${USER}` },
    { cookie: `byeolkong_user_id=${USER}`, authorization: "Bearer nope" },
    { authorization: "Bearer" },
    { authorization: `Basic ${Buffer.from("a:b").toString("base64")}` },
    { authorization: good.replace("Bearer", "Token") },
    { authorization: await bearer({ secret: "o".repeat(40) }) },
    { authorization: await bearer({ nowSec: Math.floor(Date.now() / 1000) - 3601 }) },
  ];
  for (const headers of cases) {
    const res = await handoffCode(codeReq(headers));
    assert.equal(res.status, 401, JSON.stringify(headers));
    assert.deepEqual(await res.json(), { error: "unauthorized" });
  }
  assert.deepEqual(fakes.state.calls, []);
  assert.deepEqual(logLines(fakes), []);
});

test("교환 코드 저장 실패 → 500 internal + 오류 로그(회원 ID) — 응답에 코드가 실리지 않는다", async () => {
  const { handoffCode, fakes } = await load();
  fakes.reset();
  fakes.state.failOn = "insertHandoff";
  const res = await handoffCode(codeReq({ authorization: await bearer() }));
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal" });
  assert.deepEqual(fakes.state.logs.map((l) => [l.level, l.message, l.route, l.userId]), [
    ["error", "db blip: insertHandoff", R_HANDOFF_CODE, USER],
  ]);
});

test("교환 코드 속도 제한 — 같은 IP 31번째는 429, 코드를 만들지 않는다", async () => {
  const { handoffCode, fakes } = await load();
  fakes.reset();
  const ip = nextIp();
  for (let i = 0; i < 30; i++) assert.equal((await handoffCode(codeReq({}, ip))).status, 401);
  const res = await handoffCode(codeReq({ authorization: await bearer() }, ip));
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: "rate_limited" });
  assert.deepEqual(fakes.state.handoff, []);
});

// ───────────────────────── 웹뷰 쿠키 (handoff · reset) ─────────────────────────

test("앱 실행 흐름 — 갱신 → 교환 코드 → 웹뷰 쿠키(launch: next 그대로·쿼리 안 붙임, 캐시 금지) · 같은 코드를 또 쓰면 쿠키 없이 next 로, 로그 없음", async () => {
  const { refresh, handoffCode, handoff, fakes } = await load();
  fakes.reset();
  const t = await issueAppTokens(fakes.supabaseAppSessionStore(), USER, "android");
  const { accessToken } = (await (await refresh(refreshReq({ refreshToken: t.refreshToken }))).json()) as { accessToken: string };
  const { handoffCode: code } = (await (await handoffCode(codeReq({ authorization: `Bearer ${accessToken}` }))).json()) as { handoffCode: string };

  const res = await handoff(handoffReq("next=%2Ffortune%3Ftab%3D1&mode=launch", code));
  assert.equal(res.status, 307);
  const loc = redirectTo(res);
  assert.equal(loc.origin, BASE);
  assert.equal(loc.pathname + loc.search, "/fortune?tab=1");
  assert.match(setCookie(res, "byeolkong_user_id") ?? "", new RegExp(`^byeolkong_user_id=${USER};`));
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");

  const again = await handoff(handoffReq("next=%2Ffortune&mode=launch", code));
  assert.equal(redirectTo(again).pathname + redirectTo(again).search, "/fortune");
  assert.equal(setCookie(again, "byeolkong_user_id"), undefined);
  assert.deepEqual(logLines(fakes), []);
});

test("handoff — 무효 코드는 로그를 남기지 않는다(속도 제한 없는 주소라 남기면 누구나 error_logs 를 채운다), DB 장애만 오류 로그 — 둘 다 쿠키 없이 실패 규칙대로", async () => {
  const { handoff, fakes } = await load();
  fakes.reset();
  const bad = await handoff(handoffReq("next=%2F&mode=login", "nope"));
  assert.equal(redirectTo(bad).searchParams.get("reason"), "handoff_invalid");
  assert.equal(setCookie(bad, "byeolkong_user_id"), undefined);
  assert.deepEqual(fakes.state.calls, ["claimHandoff"]);
  assert.deepEqual(logLines(fakes), []);

  fakes.state.failOn = "claimHandoff";
  const code = "c".repeat(43);
  const login = await handoff(handoffReq("next=%2Ftarot%2Fdraw%3Fresume%3Dlogin&mode=login", code));
  const loc = redirectTo(login);
  assert.deepEqual([loc.pathname, loc.searchParams.get("resume"), loc.searchParams.get("login"), loc.searchParams.get("reason")], [
    "/tarot/draw",
    "login",
    "fail",
    "handoff_invalid",
  ]);
  assert.equal(setCookie(login, "byeolkong_user_id"), undefined);
  const launch = await handoff(handoffReq("next=%2Ffortune&mode=launch", code));
  assert.equal(redirectTo(launch).pathname + redirectTo(launch).search, "/fortune");
  assert.equal(launch.headers.get("cache-control"), "no-store");
  assert.deepEqual(logLines(fakes), [
    ["error", "db blip: claimHandoff", R_HANDOFF],
    ["error", "db blip: claimHandoff", R_HANDOFF],
  ]);
  assert.ok(!JSON.stringify(fakes.state.logs).includes(code));
});

test("next 는 우리 주소의 내부 경로만 — 바깥 주소(//·/\\·https:)면 홈으로(handoff 성공·실패, reset 모두)", async () => {
  const { handoff, reset, fakes } = await load();
  fakes.reset();
  const store = fakes.supabaseAppSessionStore();
  for (const evil of ["//evil.example", "/\\evil.example", "https://evil.example/x"]) {
    const q = `next=${encodeURIComponent(evil)}`;
    const ok = await handoff(handoffReq(`${q}&mode=login`, await createHandoffCode(store, USER, false)));
    assert.ok(setCookie(ok, "byeolkong_user_id"), evil);
    const failed = await handoff(handoffReq(`${q}&mode=launch`, "nope"));
    const cleared = await reset(resetReq(q, APP_UA));
    for (const res of [ok, failed, cleared]) {
      const loc = redirectTo(res);
      assert.deepEqual([loc.origin, loc.pathname], [BASE, "/"], evil);
    }
  }
});

test("reset — 앱 UA 면 회원·어드민 쿠키를 지우고(Max-Age=0) next 로, 일반 브라우저면 쿠키를 건드리지 않고 next 로(둘 다 캐시 금지), next 없으면 홈", async () => {
  const { reset } = await load();
  const app = await reset(resetReq("next=%2Ffortune%3Ftab%3D1", APP_UA));
  assert.equal(app.status, 307);
  assert.equal(redirectTo(app).pathname + redirectTo(app).search, "/fortune?tab=1");
  for (const name of ["byeolkong_user_id", "byeolkong_admin_token"]) {
    const c = setCookie(app, name) ?? "";
    assert.match(c, new RegExp(`^${name}=;`), name);
    assert.match(c, /Max-Age=0/i, name);
  }
  assert.equal(app.headers.get("cache-control"), "no-store");

  const web = await reset(resetReq("next=%2Ffortune%3Ftab%3D1", SAFARI_UA));
  assert.equal(web.status, 307);
  assert.equal(redirectTo(web).pathname + redirectTo(web).search, "/fortune?tab=1");
  assert.equal(setCookie(web, "byeolkong_user_id"), undefined);
  assert.equal(setCookie(web, "byeolkong_admin_token"), undefined);
  assert.equal(web.headers.get("cache-control"), "no-store");

  assert.equal(redirectTo(await reset(resetReq("", APP_UA))).pathname, "/");
});

// ───────────────────────── 로그아웃 (logout) ─────────────────────────

test("로그아웃 — 그 기기 묶음 전부 폐기 → 200 success, 그 뒤 최신 토큰 갱신은 401 invalid(재사용 경고 아님), 다른 기기는 그대로", async () => {
  const { refresh, logout, fakes } = await load();
  fakes.reset();
  const store = fakes.supabaseAppSessionStore();
  const phone = await issueAppTokens(store, USER, "ios");
  const tablet = await issueAppTokens(store, USER, "android");
  const latest = ((await (await refresh(refreshReq({ refreshToken: phone.refreshToken }))).json()) as { refreshToken: string }).refreshToken;

  const res = await logout(logoutReq({ refreshToken: latest }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true });
  const phoneRows = fakes.state.refresh.filter((r) => r.family_id === phone.familyId);
  assert.equal(phoneRows.length, 2);
  assert.ok(phoneRows.every((r) => r.revoked_at));

  const after = await refresh(refreshReq({ refreshToken: latest }));
  assert.equal(after.status, 401);
  assert.deepEqual(await after.json(), { error: "invalid" });
  assert.equal((await refresh(refreshReq({ refreshToken: tablet.refreshToken }))).status, 200);
  assert.deepEqual(logLines(fakes), []);
});

test("로그아웃은 멱등 — 모르는 토큰도 200(폐기 없음, 로그 없음), 본문이 틀리면 DB 에 묻지도 않고 200", async () => {
  const { logout, fakes } = await load();
  fakes.reset();
  const bad = [logoutReq(null, { raw: "{" }), logoutReq({}), logoutReq({ refreshToken: 1 }), logoutReq({ refreshToken: "a".repeat(10_001) })];
  for (const req of bad) {
    const res = await logout(req);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { success: true });
  }
  assert.deepEqual(fakes.state.calls, []);
  const res = await logout(logoutReq({ refreshToken: "nope" }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true });
  assert.deepEqual(fakes.state.calls, ["findRefresh"]);
  assert.deepEqual(logLines(fakes), []);
});

test("로그아웃 중 DB 오류 → 500 internal + 오류 로그(토큰 원문 없음) — 앱은 무시하고 기기 토큰을 지운다", async () => {
  const { logout, fakes } = await load();
  fakes.reset();
  const t = await issueAppTokens(fakes.supabaseAppSessionStore(), USER, "ios");
  for (const failOn of ["findRefresh", "revokeFamily"] as const) {
    fakes.state.failOn = failOn;
    const res = await logout(logoutReq({ refreshToken: t.refreshToken }));
    assert.equal(res.status, 500, failOn);
    assert.deepEqual(await res.json(), { error: "internal" });
  }
  assert.deepEqual(logLines(fakes), [
    ["error", "db blip: findRefresh", R_LOGOUT],
    ["error", "db blip: revokeFamily", R_LOGOUT],
  ]);
  assert.ok(!JSON.stringify(fakes.state.logs).includes(t.refreshToken));
});
