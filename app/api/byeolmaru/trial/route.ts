// app/api/byeolmaru/trial/route.ts — 3일 무료 체험 시작(1회성).
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { startTrial } from "@/lib/byeolmaru/entitlement";
import { logError, ctxFromRequest } from "@/lib/logger";

export const runtime = "nodejs";

const ROUTE = "/api/byeolmaru/trial";

export async function POST(req: NextRequest) {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "login_required" }, { status: 401 });
  try {
    const r = await startTrial(userId);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    // 🔴 기록 실패를 성공처럼 돌려주지 않는다(2026-10-12) — 예전엔 startTrial 이 DB 에러를 삼켜 200 {ok, alreadyUsed:true}
    //    가 나갔고, 화면은 새로 읽어도 체험 전 그대로라 유저는 말없이 버튼만 되돌아온 걸 봤다(/admin/errors 에도 없었다).
    await logError(e, ctxFromRequest(req, { route: ROUTE, userId }));
    return NextResponse.json({ error: "trial_failed" }, { status: 500 });
  }
}
