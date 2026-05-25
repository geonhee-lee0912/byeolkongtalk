// 카카오 OAuth 콜백 — 토큰 발급, 사용자 정보 조회, users upsert, 세션 쿠키 설정.
// Phase 4 (b) 시점: readings/star_balances 테이블 없으므로 게스트 마이그레이션 + 별 잔액 초기화는 미적용.
// Phase 4 (c) stars 이식 + Phase 5 readings 추가 시 보강 (아래 TODO 주석 참고).

import { NextRequest, NextResponse } from "next/server";
import { getKakaoToken, getKakaoUser } from "@/lib/kakao";
import { getServiceSupabase } from "@/lib/supabase";
import { setUserCookie } from "@/lib/session";
import { logError, ctxFromRequest } from "@/lib/logger";

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

  // open redirect 차단
  const next =
    stateNext.startsWith("/") && !stateNext.startsWith("//") ? stateNext : "/";

  const failRedirect = (reason: string) => {
    const u = new URL(baseUrl);
    u.searchParams.set("login", "fail");
    u.searchParams.set("reason", reason);
    const r = NextResponse.redirect(u);
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

    // 3. Supabase users upsert
    const supabase = getServiceSupabase();
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("kakao_id", kakaoId)
      .maybeSingle();

    let userId: string;
    let isNewUser = false;

    if (existingUser) {
      userId = existingUser.id;
      await supabase
        .from("users")
        .update({
          nickname,
          profile_img: profileImg,
          last_login: new Date().toISOString(),
        })
        .eq("id", userId);
    } else {
      const { data: newUser, error: insErr } = await supabase
        .from("users")
        .insert({ kakao_id: kakaoId, nickname, profile_img: profileImg })
        .select("id")
        .single();
      if (insErr || !newUser) {
        await logError(insErr ?? new Error("user insert null"), {
          route: "/api/auth/kakao",
          extra: { kakaoId, nickname },
        });
        return failRedirect("user_insert_failed");
      }
      userId = newUser.id;
      isNewUser = true;

      // TODO (Phase 4 c): star_balances 신규 row INSERT — stars 테이블 추가 후 활성화
    }

    // TODO (Phase 5): byeolkong_anon_id 의 readings 를 user_id 로 이관 (migrate_anonymous_readings RPC)

    // 4. redirect + 쿠키 세팅
    const redirectUrl = new URL(next.startsWith("/") ? next : "/", baseUrl);
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
    return res;
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: "/api/auth/kakao" }));
    return failRedirect("internal");
  }
}
