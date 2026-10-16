// 카카오 OAuth 콜백 — 토큰 발급, 사용자 정보 조회, 회원 찾기·만들기, 세션 쿠키 설정.
// 회원 찾기·만들기와 신규 가입 처리(유입 기록·별 잔액·웰컴 별·CAPI)는 lib/auth/sign-in.ts + sign-in-deps.ts 로 옮겼다 —
// 앱 로그인(카카오·애플)과 웹 애플 로그인이 같은 처리를 쓴다(스펙 2026-10-12-앱-1 §7-1). 이 라우트의 겉 동작은 그대로다
// (lib/auth/kakao-callback.test.ts 가 잠근다).

import { NextRequest, NextResponse } from "next/server";
import { getKakaoToken, getKakaoUser } from "@/lib/kakao";
import { setUserCookie } from "@/lib/session";
import { logError, logWarn, ctxFromRequest } from "@/lib/logger";
import { ACQ_COOKIE } from "@/lib/acquisition";
import { safeNextPath } from "@/lib/safe-internal-path";
import { loginFailRedirectUrl } from "@/lib/auth-redirect";
import { signIn } from "@/lib/auth/sign-in";
import { supabaseSignInDeps } from "@/lib/auth/sign-in-deps";

const STATE_COOKIE = "byeolkong_oauth_state";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const stateParam = searchParams.get("state") || "";

  // CSRF 검증: state 형식 "{nonce}|{nextPath}"
  const sepIdx = stateParam.indexOf("|");
  const stateNonce = sepIdx >= 0 ? stateParam.slice(0, sepIdx) : stateParam;
  const stateNext = sepIdx >= 0 ? stateParam.slice(sepIdx + 1) : "/";
  const cookieNonce = request.cookies.get(STATE_COOKIE)?.value;
  const stateOk =
    cookieNonce &&
    stateNonce &&
    cookieNonce === stateNonce &&
    stateNonce.length === 32;

  // open redirect 차단 — 내부 상대경로만 허용(safeNextPath 가 정규화·재검증)
  const next = safeNextPath(stateNext);

  const failRedirect = (reason: string) => {
    // 뽑기 이어가기로 가던 로그인만 그 화면으로 돌려보내 안내한다 — 그 밖은 지금처럼 홈(lib/auth-redirect.ts)
    const r = NextResponse.redirect(loginFailRedirectUrl(next, reason, baseUrl));
    r.cookies.set(STATE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return r;
  };

  if (!stateOk) {
    return failRedirect("csrf_state_mismatch");
  }
  if (error || !code) {
    return failRedirect(error || "no_code");
  }

  try {
    // 1. 카카오 토큰 발급
    const tokenData = await getKakaoToken(code);
    if (!tokenData.access_token) {
      // KOE320/invalid_grant = 이미 사용된(중복 콜백) 또는 만료된 인가 코드.
      // 카카오톡 인앱 브라우저의 콜백 더블로드·브라우저 재시도 등으로 흔히 발생하는 '정상' 상황이야:
      // 첫 요청이 코드를 소비해 로그인은 이미 됐고, 두 번째 요청이 여기로 옴 → 서버 버그 아님.
      // error 로 찍어 대시보드를 오염시키지 말고 warn 으로 남기고, 실패 화면 대신 조용히 목적지로 보냄
      // (첫 요청이 세션을 이미 세팅했을 수 있으므로 login=fail 로 로그인된 유저를 놀래키지 않음).
      const benign =
        tokenData.error === "invalid_grant" || tokenData.error_code === "KOE320";
      if (benign) {
        await logWarn(
          `Kakao token invalid_grant (중복/만료 콜백): ${tokenData.error_code ?? tokenData.error}`,
          ctxFromRequest(request, { route: "/api/auth/kakao" })
        );
        const u = new URL(next, baseUrl);
        const r = NextResponse.redirect(u);
        r.cookies.set(STATE_COOKIE, "", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 0,
        });
        return r;
      }
      await logError(
        new Error(`Kakao token failed: ${JSON.stringify(tokenData)}`),
        ctxFromRequest(request, { route: "/api/auth/kakao" })
      );
      return failRedirect("token_failed");
    }

    // 2. 카카오 사용자 정보 조회
    const kakaoUser = await getKakaoUser(tokenData.access_token);
    const kakaoId = kakaoUser.id;
    const nickname =
      kakaoUser.kakao_account?.profile?.nickname || `별콩이_${kakaoId}`;
    const profileImg =
      kakaoUser.kakao_account?.profile?.profile_image_url || null;

    // 3. 회원 찾기·만들기 — 신규면 유입 기록·별 잔액·웰컴 별·CAPI 까지(lib/auth/sign-in-deps.ts)
    const result = await signIn(
      { provider: "kakao", providerUserId: String(kakaoId), nickname, profileImg },
      supabaseSignInDeps(request, "/api/auth/kakao")
    );
    if (!result.ok) {
      return failRedirect(result.reason);
    }
    const { userId, isNewUser } = result;

    // TODO (Phase 5): byeolkong_anon_id 의 readings 를 user_id 로 이관 (migrate_anonymous_readings RPC)

    // 4. redirect + 쿠키 세팅
    const redirectUrl = new URL(next, baseUrl);
    redirectUrl.searchParams.set("login", "success");
    if (isNewUser) redirectUrl.searchParams.set("welcome", "1");

    const res = NextResponse.redirect(redirectUrl);
    await setUserCookie(res, userId);
    // OAuth state 쿠키 정리 (1회용 — 재사용 차단)
    res.cookies.set(STATE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    // acq 쿠키 1회성 소비 — 저장 후 삭제(신규/기존 무관 정리)
    res.cookies.set(ACQ_COOKIE, "", {
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: "/api/auth/kakao" }));
    return failRedirect("internal");
  }
}
