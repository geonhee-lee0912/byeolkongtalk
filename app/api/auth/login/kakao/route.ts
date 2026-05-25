// 로그인 페이지에서 "카카오로 시작" 클릭 → 이 라우트 GET → kauth.kakao.com 으로 redirect.
// CSRF 방어: random nonce 를 state 에 박고, 같은 값을 httpOnly 쿠키에 저장 후
// 콜백에서 state(returned) === cookie nonce 검증.

import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { getKakaoLoginUrl } from "@/lib/kakao";

const STATE_COOKIE = "byeolkong_oauth_state";
const STATE_TTL_SEC = 5 * 60; // 5분 — 카카오 동의 화면 진행 시간 고려

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawNext = searchParams.get("next") || "/";
  // open redirect 방지 — 절대 URL 또는 //attacker.com 차단, 내부 path만 허용
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  const nonce = randomBytes(16).toString("hex");
  // state 형식: "{nonce}|{nextPath}" — nonce 는 32자 hex, nextPath 는 검증된 내부 path
  const state = `${nonce}|${next}`;

  const kakaoUrl = new URL(getKakaoLoginUrl());
  kakaoUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(kakaoUrl);
  res.cookies.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_SEC,
  });
  return res;
}
