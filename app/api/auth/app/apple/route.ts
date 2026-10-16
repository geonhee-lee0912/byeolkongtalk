// 앱 애플 로그인(iOS) — identityToken(aud=번들 ID)·nonce 확인 → 인가 코드를 교환해 애플 리프레시 토큰 암호화 보관(탈퇴 revoke 용)
// → 가입·로그인 → 앱 토큰 + 웹뷰 교환 코드. 애플은 이름을 첫 로그인 때만 준다. 스펙 2026-10-12-앱-1 §7-3.
import { NextResponse, type NextRequest } from "next/server";
import { logError, logWarn, ctxFromRequest } from "@/lib/logger";
import { appleNonceHash, verifyAppleIdentityToken } from "@/lib/auth/apple";
import { appleNickname } from "@/lib/auth/nickname";
import { signIn } from "@/lib/auth/sign-in";
import { supabaseSignInDeps } from "@/lib/auth/sign-in-deps";
import { appLoginResponse, appleRefreshTokenEnc, appTokenNotConfigured, parsePlatform, rateLimited, readJson, str } from "@/lib/auth/app-route";

const ROUTE = "/api/auth/app/apple";

export async function POST(request: NextRequest) {
  const limited = rateLimited(request, "app-login");
  if (limited) return limited;

  const bundleId = process.env.APPLE_BUNDLE_ID;
  if (!bundleId) {
    await logError(new Error("APPLE_BUNDLE_ID not set"), ctxFromRequest(request, { route: ROUTE }));
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const tokenNotReady = await appTokenNotConfigured(request, ROUTE);
  if (tokenNotReady) return tokenNotReady;

  const body = await readJson(request);
  const identityToken = str(body?.identityToken);
  const nonce = str(body?.nonce);
  if (!identityToken || !nonce) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  try {
    const verified = await verifyAppleIdentityToken(identityToken, { audience: bundleId, expectedNonce: appleNonceHash(nonce) });
    if (!verified.ok) {
      if (verified.reason === "aud_mismatch") {
        // 진짜 애플 토큰인데 다른 클라이언트용 — dev·prod 번들 ID 가 뒤바뀐 설정 실수일 수 있다(카카오 app_mismatch 와 같은 자리)
        await logWarn("Apple token for another client", ctxFromRequest(request, { route: ROUTE, extra: { tokenAud: verified.aud } }));
      }
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }
    const refreshTokenEnc = await appleRefreshTokenEnc(str(body?.authorizationCode), bundleId, undefined, request, ROUTE);
    const rawName = body?.fullName;
    const fullName = rawName && typeof rawName === "object" ? (rawName as Record<string, unknown>) : null;
    const nickname = appleNickname(fullName ? { givenName: str(fullName.givenName), familyName: str(fullName.familyName) } : null);
    const result = await signIn(
      { provider: "apple", providerUserId: verified.sub, nickname, profileImg: null, apple: { clientId: bundleId, refreshTokenEnc } },
      supabaseSignInDeps(request, ROUTE),
    );
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 500 });
    return await appLoginResponse(result.userId, result.isNewUser, parsePlatform(body?.platform));
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: ROUTE }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
