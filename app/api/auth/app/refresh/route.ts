// 앱 토큰 갱신 — 리프레시 토큰을 새것으로 교체한다. 재사용(교체된 토큰이 10초 뒤 다시 옴)이면 그 기기 묶음을 폐기하고 401.
// 앱은 401 이면 기기 토큰을 지우고 로그아웃 상태로 연다. 스펙 2026-10-12-앱-1 §7-4.
import { NextResponse, type NextRequest } from "next/server";
import { logError, logWarn, ctxFromRequest } from "@/lib/logger";
import { rotateRefreshToken } from "@/lib/auth/app-session";
import { supabaseAppSessionStore } from "@/lib/auth/app-session-store";
import { appTokenNotConfigured, noStore, rateLimited, readJson, str } from "@/lib/auth/app-route";

const ROUTE = "/api/auth/app/refresh";

export async function POST(request: NextRequest) {
  const limited = rateLimited(request, "app-refresh", 30);
  if (limited) return limited;
  // 서명 비밀값이 없거나 짧으면 옛 토큰을 claim 하기 전에 멈춘다(앱은 500·503 이면 토큰을 지키고 다음에 다시 시도한다)
  const tokenNotReady = await appTokenNotConfigured(request, ROUTE);
  if (tokenNotReady) return tokenNotReady;

  const refreshToken = str((await readJson(request))?.refreshToken);
  if (!refreshToken) return NextResponse.json({ error: "invalid" }, { status: 401 });

  try {
    const r = await rotateRefreshToken(supabaseAppSessionStore(), refreshToken);
    if (!r.ok) {
      if (r.reason === "reused") {
        await logWarn("App refresh token reused — device family revoked", ctxFromRequest(request, { route: ROUTE }));
      }
      return NextResponse.json({ error: r.reason }, { status: 401 });
    }
    return noStore(NextResponse.json(r.tokens));
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: ROUTE }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
