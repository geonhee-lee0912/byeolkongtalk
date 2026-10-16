// apple-web-routes.test.ts 전용 가짜 — 웹 애플 로그인 라우트(app/api/auth/login/apple · apple/callback · apple/complete)와
// 공용 모듈(lib/auth/app-route.ts)이 import 하는 @/lib/logger · @/lib/auth/apple · @/lib/auth/sign-in-deps · ./app-session-store 자리에
// 이 모듈 하나가 들어간다(테스트의 resolve 훅). signIn·닉네임·애플 리프레시 토큰 교환 래퍼(app-route.ts)·암호화(token-crypto.ts)·
// 세션 쿠키(lib/session.ts)·next 거르기·실패 목적지는 진짜가 돈다 — 애플 서버와 DB 자리만 아래 메모리 값이다.
import { createHash } from "node:crypto";
import type { AppSessionStore } from "./app-session.ts";
import type { AppleVerifyResult } from "./apple.ts";
import type { IdentityInsert, SignInDeps } from "./sign-in.ts";

export const NEW_USER = "5b0e2c4a-8d1f-4e3a-9b6c-7a2d1e0f3c4b";
export const OLD_USER = "c3d9e1f2-6a7b-4c8d-9e0f-1a2b3c4d5e6f";
export const APPLE_SUB = "001234.0a1b2c3d4e5f60718293a4b5c6d7e8f9.0123";

type InsertUserResult = Awaited<ReturnType<SignInDeps["insertUser"]>>;
type LogCtx = { route?: string; userId?: string | null; extra?: Record<string, unknown> };

export type LoggedEntry = {
  level: "error" | "warn";
  message: string;
  route: string | undefined;
  extra: Record<string, unknown>;
};

type State = {
  /** id_token 확인 결과 — Error 면 throw(애플 공개키 조회 장애 자리) */
  apple: AppleVerifyResult | Error;
  appleCalls: { idToken: string; audience: string; expectedNonce: string }[];
  /** 인가 코드 교환 결과 — null 은 invalid_grant, Error 면 throw(invalid_client·애플 장애·타임아웃 자리) */
  exchange: { refreshToken: string } | null | Error;
  exchangeCalls: { code: string; clientId: string; redirectUri: string | undefined }[];
  /** 로그인 수단으로 찾은 기존 회원(null = 신규) */
  existingUserId: string | null;
  /** 회원 만들기 결과 — Error 면 throw(DB 장애 자리) */
  insertUserResult: InsertUserResult | Error;
  insertUsers: Parameters<SignInDeps["insertUser"]>[0][];
  identityInserts: IdentityInsert[];
  identityTouches: { provider: string; providerUserId: string; patch: Parameters<SignInDeps["updateIdentityOnLogin"]>[2] }[];
  userUpdates: { userId: string; patch: Parameters<SignInDeps["updateUserOnLogin"]>[1] }[];
  newUserCalls: number;
  newUserHash: string | null;
  /** supabaseSignInDeps 를 부른 인자 — 로그 라벨과, 유입 쿠키(acq·anon)·CAPI 신호(_fbp·_fbc)를 읽을 요청 */
  depsRoute: string | null;
  depsRequest: unknown;
  logs: LoggedEntry[];
};

function fresh(): State {
  return {
    apple: { ok: true, sub: APPLE_SUB },
    appleCalls: [],
    exchange: { refreshToken: "r0.apple-refresh-token" },
    exchangeCalls: [],
    existingUserId: null,
    insertUserResult: { ok: true, id: NEW_USER },
    insertUsers: [],
    identityInserts: [],
    identityTouches: [],
    userUpdates: [],
    newUserCalls: 0,
    newUserHash: null,
    depsRoute: null,
    depsRequest: null,
    logs: [],
  };
}

export const state: State = fresh();

export function reset(): void {
  Object.assign(state, fresh());
}

function settle<T>(v: T | Error): T {
  if (v instanceof Error) throw v;
  return v;
}

// ── @/lib/logger ──
export async function logError(err: unknown, ctx: LogCtx = {}) {
  state.logs.push({ level: "error", message: err instanceof Error ? err.message : String(err), route: ctx.route, extra: ctx.extra ?? {} });
}
export async function logWarn(message: string, ctx: LogCtx = {}) {
  state.logs.push({ level: "warn", message, route: ctx.route, extra: ctx.extra ?? {} });
}
export function ctxFromRequest(_req: Request, base: LogCtx = {}): LogCtx {
  return base;
}

// ── @/lib/auth/apple ──
/** 진짜와 같은 공식(sha256 hex) — 라우트가 쿠키 원본을 해시해서 넘기는지는 테스트가 따로 계산해 대조한다 */
export function appleNonceHash(rawNonce: string): string {
  return createHash("sha256").update(rawNonce).digest("hex");
}
export async function verifyAppleIdentityToken(
  idToken: string,
  opts: { audience: string; expectedNonce: string },
): Promise<AppleVerifyResult> {
  state.appleCalls.push({ idToken, audience: opts.audience, expectedNonce: opts.expectedNonce });
  return settle(state.apple);
}
export async function exchangeAppleCode(
  code: string,
  clientId: string,
  opts: { redirectUri?: string } = {},
): Promise<{ refreshToken: string } | null> {
  state.exchangeCalls.push({ code, clientId, redirectUri: opts.redirectUri });
  return settle(state.exchange);
}

// ── @/lib/auth/sign-in-deps ──
export function supabaseSignInDeps(request: unknown, route: string): SignInDeps {
  state.depsRequest = request;
  state.depsRoute = route;
  return {
    findIdentityUserId: async () => state.existingUserId,
    findLegacyKakaoUserId: async () => null,
    insertIdentity: async (row) => {
      state.identityInserts.push(row);
      return { ok: true };
    },
    updateIdentityOnLogin: async (provider, providerUserId, patch) => {
      state.identityTouches.push({ provider, providerUserId, patch });
    },
    insertUser: async (row) => {
      state.insertUsers.push(row);
      return settle(state.insertUserResult);
    },
    deleteUser: async () => {},
    updateUserOnLogin: async (userId, patch) => {
      state.userUpdates.push({ userId, patch });
    },
    onNewUser: async (_userId, identityHashValue) => {
      state.newUserCalls++;
      state.newUserHash = identityHashValue;
    },
  };
}

// ── ./app-session-store (lib/auth/app-session-store.ts) — app-route.ts 가 import 한다. 웹 애플 라우트는 앱 토큰을 만들지 않는다 ──
export function supabaseAppSessionStore(): AppSessionStore {
  const unexpected = (name: string) => async () => {
    throw new Error(`apple-web-routes.fakes: 웹 애플 라우트가 ${name} 를 부를 일은 없다`);
  };
  return {
    insertRefresh: unexpected("insertRefresh"),
    insertHandoff: unexpected("insertHandoff"),
    claimRefresh: unexpected("claimRefresh"),
    releaseRefresh: unexpected("releaseRefresh"),
    findRefresh: unexpected("findRefresh"),
    revokeFamily: unexpected("revokeFamily"),
    claimHandoff: unexpected("claimHandoff"),
  };
}
