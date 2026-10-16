// 세션/쿠키 헬퍼 (Next 16, cookies()·headers() async)
// - byeolkong_anon_id: 게스트 식별자 (proxy 자동 발급 — 구 middleware.ts)
// - byeolkong_user_id: 로그인 후 발급 (users.id UUID) — 브라우저·앱 웹뷰용
// - byeolkong_admin_token: ADMIN_USER_IDS 화이트리스트 유저만 발급 (HMAC-SHA256)
// - Authorization: Bearer <앱 액세스 토큰> — 앱(React Native) 쪽 호출용(스펙 2026-10-12-앱-1 §7-4).
//   Bearer 면 토큰만 본다(토큰이 비었거나 틀려도 — 실패면 비로그인, 회원·익명 쿠키 둘 다 안 본다). 결정 규칙은 lib/auth/session-resolve.ts,
//   이 연결부는 lib/session.test.ts 가 고정한다.
//   iOS 는 웹뷰와 앱 호출의 쿠키 저장소가 따로고, 안드로이드는 공유될 수 있다.

import { cookies, headers } from "next/headers";
import type { NextResponse } from "next/server";
import { isAdminUserId } from "@/lib/admin";
import { signAdminToken } from "@/lib/auth-token";
import { parseBearer, verifyAccessToken } from "@/lib/auth/app-token";
import { isBearerScheme, resolveSessionUserId } from "@/lib/auth/session-resolve";

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
 * 현재 요청의 세션 정보 반환. Next 16 의 cookies()·headers() 는 async 이므로
 * 모든 호출처에서 await 필요.
 */
export async function getSession(): Promise<Session> {
  const store = await cookies();
  const authorization = (await headers()).get("authorization");
  const hasBearer = isBearerScheme(authorization);
  const token = parseBearer(authorization);
  const userId = resolveSessionUserId({
    hasBearer,
    tokenUserId: token ? await verifyAccessToken(token) : null,
    cookieUserId: store.get(USER_COOKIE)?.value,
  });
  return {
    userId,
    // Bearer(앱 쪽 호출)면 익명 쿠키도 안 본다 — 토큰 실패가 게스트 응답으로 가려지지 않게(안드로이드는 웹뷰 쿠키가 실린다)
    anonymousId: hasBearer ? null : store.get(ANON_COOKIE)?.value || null,
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
 * 로그인 성공 후 응답에 user_id 쿠키 세팅(카카오·애플 웹 콜백, 앱 웹뷰 교환 코드).
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
