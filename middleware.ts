// 1) 첫 진입 사용자에게 anonymous_id 쿠키 발급 (API 라우트 식별용)
// 2) /admin/* 진입 시 화이트리스트 + HMAC 서명 토큰 둘 다 검증

import { NextResponse, type NextRequest } from "next/server";
import { verifyAdminToken } from "@/lib/auth-token";

const ANON_COOKIE = "byeolkong_anon_id";
const USER_COOKIE = "byeolkong_user_id";
const ADMIN_TOKEN_COOKIE = "byeolkong_admin_token";

const ADMIN_IDS = new Set(
  (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /admin/* 및 /api/admin/* 가드 — 1차: 화이트리스트, 2차: HMAC 토큰. 둘 다 통과해야 진입
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const userId = req.cookies.get(USER_COOKIE)?.value?.toLowerCase();
    const adminToken = req.cookies.get(ADMIN_TOKEN_COOKIE)?.value;

    const inWhitelist = !!userId && ADMIN_IDS.has(userId);
    const tokenOk = inWhitelist
      ? await verifyAdminToken(userId, adminToken)
      : false;

    if (!inWhitelist || !tokenOk) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.searchParams.set("admin", tokenOk ? "denied" : "token_invalid");
      return NextResponse.redirect(url);
    }
  }

  const res = NextResponse.next();

  if (!req.cookies.get(ANON_COOKIE)) {
    const anonId = crypto.randomUUID();
    res.cookies.set(ANON_COOKIE, anonId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1년
    });
  }

  return res;
}

export const config = {
  // 정적 자산/이미지/폰트는 미들웨어 우회
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts/|api/og).*)",
  ],
};
