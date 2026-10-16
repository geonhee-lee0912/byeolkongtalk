// kakao-callback.test.ts 전용 가짜 — 카카오 웹 콜백(app/api/auth/kakao/route.ts)이 import 하는
// @/lib/kakao · @/lib/session · @/lib/logger · @/lib/auth/sign-in-deps 자리에 이 모듈 하나가 들어간다(테스트의 resolve 훅).
// signIn(lib/auth/sign-in.ts)은 진짜가 돈다 — DB 자리만 아래 메모리 의존성이다. 라우트가 signIn 에 넘긴 값은 아래에 남는다.
import type { NextResponse } from "next/server";
import type { SignInDeps } from "./sign-in.ts";

type InsertUserResult = Awaited<ReturnType<SignInDeps["insertUser"]>>;

type State = {
  token: Record<string, unknown>;
  user: Record<string, unknown>;
  existingUserId: string | null;
  /** 회원 만들기 결과 — 실패 경로(user_insert_failed)를 돌릴 때 바꾼다 */
  insertUserResult: InsertUserResult;
  /** 회원 만들기·로그인 갱신에 들어온 값(마지막 1건) */
  lastInsertUser: Parameters<SignInDeps["insertUser"]>[0] | null;
  lastUserUpdate: { userId: string; patch: Parameters<SignInDeps["updateUserOnLogin"]>[1] } | null;
  newUserCalls: number;
  /** 신규 처리에 넘어온 웰컴 별 원장 해시(마지막 1건) */
  newUserHash: string | null;
  /** supabaseSignInDeps 를 부른 인자 — 로그 라벨과, 유입 쿠키·CAPI 신호를 읽을 요청 */
  depsRoute: string | null;
  depsRequest: unknown;
  cookieUserId: string | null;
  warns: string[];
  errors: unknown[];
};

function fresh(): State {
  return {
    token: { access_token: "kakao-at" },
    user: {
      id: 4123456789,
      kakao_account: { profile: { nickname: "별콩", profile_image_url: "https://img.example/p.jpg" } },
    },
    existingUserId: null,
    insertUserResult: { ok: true, id: "new-user" },
    lastInsertUser: null,
    lastUserUpdate: null,
    newUserCalls: 0,
    newUserHash: null,
    depsRoute: null,
    depsRequest: null,
    cookieUserId: null,
    warns: [],
    errors: [],
  };
}

export const state: State = fresh();

export function reset(): void {
  Object.assign(state, fresh());
}

// ── @/lib/kakao ──
export async function getKakaoToken(_code: string) {
  return state.token;
}
export async function getKakaoUser(_accessToken: string) {
  return state.user;
}

// ── @/lib/session ──
export async function setUserCookie(res: NextResponse, userId: string) {
  state.cookieUserId = userId;
  res.cookies.set("byeolkong_user_id", userId);
}

// ── @/lib/logger ──
export async function logError(err: unknown) {
  state.errors.push(err);
}
export async function logWarn(message: string) {
  state.warns.push(message);
}
export function ctxFromRequest(_req: Request, base: Record<string, unknown> = {}) {
  return base;
}

// ── @/lib/auth/sign-in-deps ──
export function supabaseSignInDeps(request: unknown, route: string): SignInDeps {
  state.depsRequest = request;
  state.depsRoute = route;
  return {
    findIdentityUserId: async () => state.existingUserId,
    findLegacyKakaoUserId: async () => null,
    insertIdentity: async () => ({ ok: true }),
    updateIdentityOnLogin: async () => {},
    insertUser: async (row) => {
      state.lastInsertUser = row;
      return state.insertUserResult;
    },
    deleteUser: async () => {},
    updateUserOnLogin: async (userId, patch) => {
      state.lastUserUpdate = { userId, patch };
    },
    onNewUser: async (_userId, identityHashValue) => {
      state.newUserCalls++;
      state.newUserHash = identityHashValue;
    },
  };
}
