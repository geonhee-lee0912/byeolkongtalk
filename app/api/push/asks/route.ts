// 알림 권한 질문 기록 — 단계 1 은 first_reading_end 만. 웹뷰 쿠키 세션.
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { logError, ctxFromRequest } from "@/lib/logger";
import { listAskMoments, recordAsk } from "@/lib/push/store";
import { handleAskPost } from "@/lib/push/user-api";

const ROUTE = "/api/push/asks";

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ moments: await listAskMoments(userId) });
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: ROUTE, userId }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  try {
    const r = await handleAskPost(await readJson(request), userId ?? null, { recordAsk });
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: ROUTE, userId: userId ?? undefined }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
