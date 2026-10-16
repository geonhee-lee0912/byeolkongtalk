// 웹 애플 로그인 마무리 — callback 이 같은 출처로 다시 보낸 POST 라 Lax 쿠키(state·acq·anon·_fbp)가 실려 온다.
// state 확인 → id_token 검증(aud=Services ID, nonce) → 코드 교환(애플 리프레시 토큰) → signIn → 세션 쿠키 → next.
// 리다이렉트·실패 처리는 카카오 콜백과 같다(login=success·welcome=1 / loginFailRedirectUrl). 스펙 2026-10-12-앱-1 §7-5.
// 다른 사이트가 이 주소로 직접 POST 하면 Lax state 쿠키가 안 실려 와서 csrf_state_mismatch 로 끝난다.
import { NextRequest, NextResponse } from "next/server";
import { setUserCookie } from "@/lib/session";
import { logError, logWarn, ctxFromRequest } from "@/lib/logger";
import { ACQ_COOKIE } from "@/lib/acquisition";
import { safeNextPath } from "@/lib/safe-internal-path";
import { loginFailRedirectUrl } from "@/lib/auth-redirect";
import { appleNonceHash, verifyAppleIdentityToken } from "@/lib/auth/apple";
import { APPLE_STATE_COOKIE, appleRedirectUri, parseAppleState, parseAppleUserName } from "@/lib/auth/apple-web";
import { appleNickname } from "@/lib/auth/nickname";
import { signIn } from "@/lib/auth/sign-in";
import { supabaseSignInDeps } from "@/lib/auth/sign-in-deps";
import { appleRefreshTokenEnc } from "@/lib/auth/app-route";

const ROUTE = "/api/auth/apple/complete";

export async function POST(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const form = await request.formData().catch(() => null);
  const field = (k: string) => {
    const v = form?.get(k);
    return typeof v === "string" ? v : "";
  };

  const { nonce: stateNonce, next: stateNext } = parseAppleState(field("state"));
  const next = safeNextPath(stateNext);
  const cookieNonce = request.cookies.get(APPLE_STATE_COOKIE)?.value;

  const clearState = (r: NextResponse) => {
    r.cookies.set(APPLE_STATE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return r;
  };
  // POST 에 대한 리다이렉트는 303 — 목적지를 GET 으로 연다
  const fail = (reason: string) => clearState(NextResponse.redirect(loginFailRedirectUrl(next, reason, baseUrl), 303));

  if (!cookieNonce || !stateNonce || cookieNonce !== stateNonce || stateNonce.length !== 32) {
    return fail("csrf_state_mismatch");
  }
  const appleError = field("error");
  if (appleError) return fail(appleError.slice(0, 64)); // user_cancelled_authorize 등
  const idToken = field("id_token");
  if (!idToken) return fail("no_code");
  const servicesId = process.env.APPLE_SERVICES_ID;
  if (!servicesId) return fail("apple_not_configured");

  try {
    const verified = await verifyAppleIdentityToken(idToken, {
      audience: servicesId,
      expectedNonce: appleNonceHash(cookieNonce),
    });
    if (!verified.ok) {
      if (verified.reason === "aud_mismatch") {
        // 진짜 애플 토큰인데 다른 클라이언트용 — APPLE_SERVICES_ID 설정 실수일 수 있다
        await logWarn("Apple token for another client", ctxFromRequest(request, { route: ROUTE, extra: { tokenAud: verified.aud } }));
      }
      return fail("invalid_token");
    }
    const refreshTokenEnc = await appleRefreshTokenEnc(field("code"), servicesId, appleRedirectUri(baseUrl), request, ROUTE);
    const result = await signIn(
      {
        provider: "apple",
        providerUserId: verified.sub,
        nickname: appleNickname(parseAppleUserName(field("user"))),
        profileImg: null,
        apple: { clientId: servicesId, refreshTokenEnc },
      },
      supabaseSignInDeps(request, ROUTE),
    );
    if (!result.ok) return fail(result.reason);

    const redirectUrl = new URL(next, baseUrl);
    redirectUrl.searchParams.set("login", "success");
    if (result.isNewUser) redirectUrl.searchParams.set("welcome", "1");
    const res = NextResponse.redirect(redirectUrl, 303);
    await setUserCookie(res, result.userId);
    // acq 쿠키 1회성 소비 — 카카오 콜백과 같다
    res.cookies.set(ACQ_COOKIE, "", { path: "/", maxAge: 0 });
    return clearState(res);
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: ROUTE }));
    return fail("internal");
  }
}
