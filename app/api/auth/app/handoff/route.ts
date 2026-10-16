// 웹뷰 쿠키 발급 — 앱이 받은 1회용 교환 코드를 세션 쿠키(byeolkong_user_id)로 바꾸고 next 로 보낸다. 스펙 2026-10-12-앱-1 §7-3·§7-4.
// 🔴 교환 코드는 헤더(HANDOFF_CODE_HEADER = X-Byeolkong-Handoff)로만 받는다 — 주소의 code 는 보지 않는다(계획 앞 '스펙과 달라진 점').
//    헤더는 앱이 자기가 여는 요청에만 붙일 수 있다(링크·딥링크·next 리다이렉트로는 못 붙인다). 주소로 받으면 딥링크·next 로 남의 코드를
//    앱 웹뷰에 먹일 수 있고, 그 요청도 앱 UA 라 아래 관문을 통과한다(앱 안 login CSRF). 덤으로 코드가 요청 로그·방문 기록에 남지 않는다.
// mode=login : 웹 카카오 콜백과 같은 쿼리(login=success, 신규면 welcome=1) — AuthBootstrap·맛보기 이어하기가 그대로 돈다.
//              코드가 없거나 안 맞으면 카카오 콜백 실패와 같은 규칙(loginFailRedirectUrl, reason=handoff_invalid).
// mode=launch: 앱 실행 때 쿠키만 맞춘다(쿼리 없음). 코드가 없거나 안 맞으면 쿠키 없이 그냥 next 로.
// 코드는 32바이트 무작위라 맞혀 볼 수 없다 — 웹뷰 화면에 429 JSON 이 뜨지 않게 이 주소엔 속도 제한을 걸지 않는다.
// 그래서 실패(코드 없음·무효)는 로그로 남기지 않는다 — 남기면 누구나 이 주소를 두드려 error_logs 를 채울 수 있다.
// 앱 UA(ByeolkongApp/…)일 때만 코드를 쓴다 — 일반 브라우저는 이동에 헤더를 붙일 수 없어 이미 막히지만, reset 라우트와 같은 관문을 겹으로 둔다
// (남이 만든 코드로 일반 브라우저가 그 계정에 로그인되지 않게 — login CSRF). 코드를 소비하기 전에 거른다.
import { NextResponse, type NextRequest } from "next/server";
import { setUserCookie } from "@/lib/session";
import { logError, ctxFromRequest } from "@/lib/logger";
import { safeNextPath } from "@/lib/safe-internal-path";
import { loginFailRedirectUrl } from "@/lib/auth-redirect";
import { consumeHandoffCode } from "@/lib/auth/app-session";
import { supabaseAppSessionStore } from "@/lib/auth/app-session-store";
import { noStore } from "@/lib/auth/app-route";
import { HANDOFF_CODE_HEADER, parseAppUserAgent } from "@/lib/app-bridge/protocol";

const ROUTE = "/api/auth/app/handoff";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  // open redirect 차단 — 내부 상대경로만(앱이 이미 걸렀어도 서버가 다시 거른다)
  const next = safeNextPath(searchParams.get("next"));
  const isLogin = searchParams.get("mode") === "login";
  const fail = () =>
    noStore(NextResponse.redirect(isLogin ? loginFailRedirectUrl(next, "handoff_invalid", baseUrl) : new URL(next, baseUrl)));
  if (!parseAppUserAgent(request.headers.get("user-agent"))) return fail();

  let consumed: { userId: string; isNewUser: boolean } | null = null;
  try {
    // 헤더가 없으면 빈 코드 — consumeHandoffCode 가 DB 에 묻지도 않고 null(주소에 code 가 있어도 같다)
    consumed = await consumeHandoffCode(supabaseAppSessionStore(), request.headers.get(HANDOFF_CODE_HEADER) ?? "");
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: ROUTE }));
  }

  if (!consumed) return fail();

  const redirectUrl = new URL(next, baseUrl);
  if (isLogin) {
    redirectUrl.searchParams.set("login", "success");
    if (consumed.isNewUser) redirectUrl.searchParams.set("welcome", "1");
  }
  const res = NextResponse.redirect(redirectUrl);
  await setUserCookie(res, consumed.userId);
  return noStore(res);
}
