// 웹 애플 로그인 시작 — state 쿠키 + 애플 인증 화면으로. 애플은 form_post 로 /api/auth/apple/callback 에 돌아온다(lib/auth/apple-web.ts).
// iOS 앱에서는 앱이 이 주소로 가는 이동을 가로채 네이티브 애플 로그인을 하므로 여기 오지 않는다. 스펙 2026-10-12-앱-1 §7-5.
import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { safeNextPath } from "@/lib/safe-internal-path";
import { loginFailRedirectUrl } from "@/lib/auth-redirect";
import { appleNonceHash } from "@/lib/auth/apple";
import { APPLE_STATE_COOKIE, APPLE_STATE_TTL_SEC, appleAuthorizeUrl, appleRedirectUri } from "@/lib/auth/apple-web";

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  // open redirect 방지 — 내부 상대경로만 허용
  const next = safeNextPath(new URL(request.url).searchParams.get("next"));
  const servicesId = process.env.APPLE_SERVICES_ID;
  if (!servicesId) return NextResponse.redirect(loginFailRedirectUrl(next, "apple_not_configured", baseUrl));

  // 무작위 값 하나로 state(CSRF)와 nonce(id_token 재사용 방지)를 같이 묶는다 — 원본은 state 로 애플을 거쳐 돌아오고(카카오와 같은 모양)
  // nonce 칸엔 sha256 을 넘긴다. 그래서 id_token 만 새면 재사용 못 하지만, 애플이 보낸 폼 본문(state + id_token)이 통째로 새면
  // 토큰이 살아 있는 동안 재사용될 수 있다 — 그 본문은 콜백 페이지(no-store)에만 있다
  const nonce = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(
    appleAuthorizeUrl({
      servicesId,
      redirectUri: appleRedirectUri(baseUrl),
      state: `${nonce}|${next}`,
      nonce: appleNonceHash(nonce),
    }),
  );
  res.cookies.set(APPLE_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: APPLE_STATE_TTL_SEC,
  });
  return res;
}
