// 앱에 토큰이 없을 때(첫 설치·로그아웃·토큰 폐기) 웹뷰에 남은 옛 쿠키를 지우고 next 로 — 앱과 웹뷰의 로그인 상태가 어긋나지 않게.
// 앱 UA(ByeolkongApp/…)일 때만 지운다 — 웹에서 링크 하나로 남을 로그아웃시키지 못하게. 스펙과 달라진 점(계획 참고).
import { NextResponse, type NextRequest } from "next/server";
import { clearUserCookie } from "@/lib/session";
import { safeNextPath } from "@/lib/safe-internal-path";
import { parseAppUserAgent } from "@/lib/app-bridge/protocol";
import { noStore } from "@/lib/auth/app-route";

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const next = safeNextPath(new URL(request.url).searchParams.get("next"));
  const res = NextResponse.redirect(new URL(next, baseUrl));
  if (parseAppUserAgent(request.headers.get("user-agent"))) clearUserCookie(res);
  return noStore(res);
}
