// 앱 토큰 갱신 — 리프레시 토큰을 새것으로 교체한다. 교체된 옛 토큰이 10초 뒤 다시 오면:
// 그 교체로 만든 새 토큰이 한 번도 안 쓰였으면 응답 유실(앱이 응답 전에 꺼짐)로 보고 다시 발급(200 + info),
// 이미 쓰였으면 재사용(탈취 가능성)으로 보고 그 기기 묶음을 폐기하고 401(운영자 11-28 B안 · lib/auth/app-session.ts).
// 교체 10초 안에 같은 토큰이 또 오거나 다른 복구와 겹치면 409 retry(기기 토큰은 살아 있다).
// 앱은 401(invalid·reused)이면 기기 토큰을 지우고 로그아웃 상태로 연다. 스펙 2026-10-12-앱-1 §7-4.
import { NextResponse, type NextRequest } from "next/server";
import { logError, logInfo, logWarn, ctxFromRequest } from "@/lib/logger";
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
      // 같은 토큰의 다른 요청이 막 처리됐다 — 409(앱은 401 만 '로그인 끝'으로 읽으니 기기 토큰을 지키고 다음에 다시 시도한다)
      if (r.reason === "retry") return NextResponse.json({ error: "retry" }, { status: 409 });
      if (r.reason === "reused") {
        await logWarn("App refresh token reused — device family revoked", ctxFromRequest(request, { route: ROUTE }));
      }
      return NextResponse.json({ error: r.reason }, { status: 401 });
    }
    if (r.recovered) {
      // 빈도 관측용 — 늘면 앱이 갱신 응답을 자주 못 받는다는 뜻(시간 제한·실행 직후 종료)
      await logInfo("App refresh response lost — reissued", ctxFromRequest(request, { route: ROUTE, userId: r.userId }));
    }
    return noStore(NextResponse.json(r.tokens));
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: ROUTE }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
