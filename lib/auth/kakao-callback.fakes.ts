// kakao-callback.test.ts 전용 가짜 — 카카오 웹 콜백(app/api/auth/kakao/route.ts)이 import 하는
// @/lib/kakao · @/lib/session · @/lib/logger · @/lib/auth/sign-in-deps 자리에 이 모듈 하나가 들어간다(테스트의 resolve 훅).
// signIn(lib/auth/sign-in.ts)은 진짜가 돈다 — DB 자리만 아래 메모리 의존성이다.
import type { NextResponse } from "next/server";
import type { SignInDeps } from "./sign-in.ts";

type State = {
  token: Record<string, unknown>;
  user: Record<string, unknown>;
  existingUserId: string | null;
  newUserCalls: number;
  cookieUserId: string | null;
  warns: string[];
  errors: unknown[];
};

function fresh(): State {
  return {
    token: { access_token: "kakao-at" },
    user: { id: 4123456789, kakao_account: { profile: { nickname: "별콩" } } },
    existingUserId: null,
    newUserCalls: 0,
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
export function supabaseSignInDeps(): SignInDeps {
  return {
    findIdentityUserId: async () => state.existingUserId,
    findLegacyKakaoUserId: async () => null,
    insertIdentity: async () => ({ ok: true }),
    updateIdentityOnLogin: async () => {},
    insertUser: async () => ({ ok: true, id: "new-user" }),
    deleteUser: async () => {},
    updateUserOnLogin: async () => {},
    onNewUser: async () => {
      state.newUserCalls++;
    },
  };
}
