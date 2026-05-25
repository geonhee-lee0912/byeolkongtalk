// 세션/쿠키 헬퍼 (Next 16, cookies() async)
// - byeolkong_anon_id: 게스트 식별자 (middleware 자동 발급)
// - byeolkong_user_id: 카카오 로그인 후 발급 (users.id UUID)
// - byeolkong_admin_token: ADMIN_USER_IDS 화이트리스트 유저만 발급 (HMAC-SHA256)

import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { isAdminUserId } from "@/lib/admin";
import { signAdminToken } from "@/lib/auth-token";

const ANON_COOKIE = "byeolkong_anon_id";
const USER_COOKIE = "byeolkong_user_id";
const ADMIN_TOKEN_COOKIE = "byeolkong_admin_token";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365, // 1년
};

export type Session = {
  userId: string | null;
  anonymousId: string | null;
  isAuthenticated: boolean;
};

/**
 * 현재 요청의 세션 정보 반환. Next 16 의 cookies() 는 async 이므로
 * 모든 호출처에서 await 필요.
 */
export async function getSession(): Promise<Session> {
  const store = await cookies();
  const userId = store.get(USER_COOKIE)?.value || null;
  const anonymousId = store.get(ANON_COOKIE)?.value || null;
  return {
    userId,
    anonymousId,
    isAuthenticated: !!userId,
  };
}

/**
 * userId 우선 → 없으면 anonymousId. 둘 다 없으면 throw.
 */
export async function requireSessionId(): Promise<{
  id: string;
  kind: "user" | "anon";
}> {
  const { userId, anonymousId } = await getSession();
  if (userId) return { id: userId, kind: "user" };
  if (anonymousId) return { id: anonymousId, kind: "anon" };
  throw new Error("No session id available");
}

/**
 * 카카오 로그인 성공 후 응답에 user_id 쿠키 세팅.
 * ADMIN_USER_IDS 유저면 HMAC 서명 어드민 토큰도 같이 발급.
 */
export async function setUserCookie(res: NextResponse, userId: string) {
  res.cookies.set(USER_COOKIE, userId, COOKIE_OPTS);
  if (isAdminUserId(userId)) {
    try {
      const token = await signAdminToken(userId);
      res.cookies.set(ADMIN_TOKEN_COOKIE, token, COOKIE_OPTS);
    } catch (err) {
      // SECRET 미설정 등 — admin 발급 실패해도 일반 로그인은 진행
      console.error("[setUserCookie] admin token sign failed:", err);
    }
  }
}

export function clearUserCookie(res: NextResponse) {
  res.cookies.set(USER_COOKIE, "", { ...COOKIE_OPTS, maxAge: 0 });
  res.cookies.set(ADMIN_TOKEN_COOKIE, "", { ...COOKIE_OPTS, maxAge: 0 });
}

export function clearAnonCookie(res: NextResponse) {
  res.cookies.set(ANON_COOKIE, "", { ...COOKIE_OPTS, maxAge: 0 });
}

export function clearAllCookies(res: NextResponse) {
  clearUserCookie(res);
  clearAnonCookie(res);
}
