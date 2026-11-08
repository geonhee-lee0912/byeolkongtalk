// 알림·광고 동의를 묻는 순간 — GET 은 이 순간에 무엇을 물을지(설계 §4-3), POST 는 묻고 받은 답 기록. 웹뷰 쿠키 세션.
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { logError, ctxFromRequest } from "@/lib/logger";
import { getAdConsent, isSubscriber, listAsks, recordAsk } from "@/lib/push/store";
import { handleAskGet, handleAskPost } from "@/lib/push/user-api";

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
  try {
    const q = request.nextUrl.searchParams;
    const r = await handleAskGet({ moment: q.get("moment"), os: q.get("os") }, userId ?? null, { listAsks, getAdConsent, isSubscriber });
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: ROUTE, userId: userId ?? undefined }));
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
