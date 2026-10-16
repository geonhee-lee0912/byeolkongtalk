// 웹뷰 교환 코드 발급 — 앱 실행 때마다 웹뷰 쿠키를 앱 로그인 상태에 맞춘다(스펙 2026-10-12-앱-1 §7-4).
// 앱 액세스 토큰(Bearer)만 받는다 — 쿠키로는 발급하지 않는다(웹 페이지가 코드를 만들 이유가 없다).
import { NextResponse, type NextRequest } from "next/server";
import { logError, ctxFromRequest } from "@/lib/logger";
import { parseBearer, verifyAccessToken } from "@/lib/auth/app-token";
import { createHandoffCode } from "@/lib/auth/app-session";
import { supabaseAppSessionStore } from "@/lib/auth/app-session-store";
import { noStore, rateLimited } from "@/lib/auth/app-route";

const ROUTE = "/api/auth/app/handoff-code";

export async function POST(request: NextRequest) {
  const limited = rateLimited(request, "app-handoff-code", 30);
  if (limited) return limited;

  const token = parseBearer(request.headers.get("authorization"));
  const userId = token ? await verifyAccessToken(token) : null;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const handoffCode = await createHandoffCode(supabaseAppSessionStore(), userId, false);
    return noStore(NextResponse.json({ handoffCode }));
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: ROUTE, userId }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
