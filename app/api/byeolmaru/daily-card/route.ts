// app/api/byeolmaru/daily-card/route.ts — 별마루 오늘의 카드 (GET 조회 / POST 뽑기 저장, 하루 1장 멱등).
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { kstDate } from "@/lib/admin-time";
import { getCardOn, recordDraw, isValidCardId } from "@/lib/byeolmaru/daily-card";
import { isIsoDate } from "@/lib/byeolmaru/report-date";
import { logError, ctxFromRequest } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });
  try {
    // ?date= 가 있으면 그날 카드를, 없으면 오늘 카드를. 카드 조회는 룰도 LLM 도 아닌 단순 기록 조회라
    // 미래 제한(reportDatePolicy)을 걸지 않는다 — 미래 날짜엔 어차피 행이 없어 null 이 나온다.
    const q = req.nextUrl.searchParams.get("date");
    if (q !== null && !isIsoDate(q)) {
      return NextResponse.json({ error: "invalid_date" }, { status: 400 });
    }
    const dateKst = q ?? kstDate(new Date().toISOString());
    const card = await getCardOn(userId, dateKst);
    return NextResponse.json({ card });
  } catch (err) {
    await logError(err, ctxFromRequest(req, { route: "/api/byeolmaru/daily-card", userId }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });
  let body: { cardId?: unknown; reversed?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!isValidCardId(body.cardId)) return NextResponse.json({ error: "invalid_card" }, { status: 400 });
  const reversed = body.reversed === true;
  try {
    const card = await recordDraw(userId, kstDate(new Date().toISOString()), body.cardId, reversed);
    return NextResponse.json({ card });
  } catch (err) {
    await logError(err, ctxFromRequest(req, { route: "/api/byeolmaru/daily-card", userId }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
