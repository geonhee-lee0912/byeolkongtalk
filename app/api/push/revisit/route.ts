// 다시 볼 날 예약 — 리딩 하나에 한 번. 웹뷰 쿠키 세션.
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { logError, ctxFromRequest } from "@/lib/logger";
import { getRevisit, readingOwner, upsertRevisit } from "@/lib/push/store";
import { handleRevisitPost } from "@/lib/push/user-api";

const ROUTE = "/api/push/revisit";

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
    const readingId = request.nextUrl.searchParams.get("readingId") ?? "";
    // 없는 리딩과 남의 리딩을 같게 답한다(403) — 존재 여부를 흘리지 않는다.
    if ((await readingOwner(readingId)) !== userId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ revisit: await getRevisit(userId, readingId) });
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: ROUTE, userId }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  try {
    const r = await handleRevisitPost(await readJson(request), userId ?? null, { readingOwner, upsertRevisit, now: () => new Date() });
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: ROUTE, userId: userId ?? undefined }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
