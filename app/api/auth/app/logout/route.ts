// 앱 로그아웃 — 그 기기 묶음의 리프레시 토큰을 전부 폐기한다. 모르는 토큰도 200(멱등).
// 웹뷰 쿠키는 웹이 이미 지웠다(마이페이지가 /api/auth/logout 후 auth.loggedOut 메시지를 보낸다). 스펙 2026-10-12-앱-1 §7-4.
import { NextResponse, type NextRequest } from "next/server";
import { logError, ctxFromRequest } from "@/lib/logger";
import { revokeByRefreshToken } from "@/lib/auth/app-session";
import { supabaseAppSessionStore } from "@/lib/auth/app-session-store";
import { readJson, str } from "@/lib/auth/app-route";

const ROUTE = "/api/auth/app/logout";

export async function POST(request: NextRequest) {
  const refreshToken = str((await readJson(request))?.refreshToken);
  if (refreshToken) {
    try {
      await revokeByRefreshToken(supabaseAppSessionStore(), refreshToken);
    } catch (err) {
      await logError(err, ctxFromRequest(request, { route: ROUTE }));
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }
  }
  return NextResponse.json({ success: true });
}
