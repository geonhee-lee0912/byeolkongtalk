// 앱 카카오 로그인 — 앱이 카카오 SDK 로 받은 액세스 토큰을 확인(app_id 대조)하고 가입·로그인 → 앱 토큰 + 웹뷰 교환 코드.
// 카카오 토큰은 서버에 저장하지 않는다(애플 지침 5.1.1(v)). 카카오 쪽 장애·타임아웃은 verifyKakaoAccessToken 이 throw → 500 + 오류 로그. 스펙 2026-10-12-앱-1 §7-3.
import { NextResponse, type NextRequest } from "next/server";
import { logError, logWarn, ctxFromRequest } from "@/lib/logger";
import { verifyKakaoAccessToken } from "@/lib/auth/kakao-verify";
import { signIn } from "@/lib/auth/sign-in";
import { supabaseSignInDeps } from "@/lib/auth/sign-in-deps";
import { appLoginResponse, parsePlatform, rateLimited, readJson, str } from "@/lib/auth/app-route";

const ROUTE = "/api/auth/app/kakao";

export async function POST(request: NextRequest) {
  const limited = rateLimited(request, "app-login");
  if (limited) return limited;

  const appId = process.env.KAKAO_APP_ID;
  if (!appId) {
    await logError(new Error("KAKAO_APP_ID not set"), ctxFromRequest(request, { route: ROUTE }));
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const body = await readJson(request);
  const accessToken = str(body?.accessToken);
  if (!accessToken) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  try {
    const kakao = await verifyKakaoAccessToken(accessToken, appId);
    if (!kakao.ok) {
      // 다른 카카오 앱의 토큰 — dev·prod 앱 ID 가 뒤바뀐 설정 실수이거나 다른 앱 토큰 재사용 시도. 조용히 넘기지 않는다
      if (kakao.reason === "app_mismatch") {
        await logWarn("Kakao token from another app", ctxFromRequest(request, { route: ROUTE, extra: { tokenAppId: kakao.appId } }));
      }
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }
    const result = await signIn(
      { provider: "kakao", providerUserId: kakao.kakaoId, nickname: kakao.nickname, profileImg: kakao.profileImg },
      supabaseSignInDeps(request, ROUTE),
    );
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 500 });
    return await appLoginResponse(result.userId, result.isNewUser, parsePlatform(body?.platform));
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: ROUTE }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
