// 다시 볼 날 예약 — 리딩 하나에 한 번. 웹뷰 쿠키 세션.
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { logError, ctxFromRequest } from "@/lib/logger";
import { getRevisit, getRevisitPref, readingOwner, upsertRevisit } from "@/lib/push/store";
import { handleRevisitGet, handleRevisitPost } from "@/lib/push/user-api";

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
  try {
    const readingId = request.nextUrl.searchParams.get("readingId") ?? "";
    const r = await handleRevisitGet(readingId, userId ?? null, { readingOwner, getRevisit, getRevisitPref });
    return NextResponse.json(r.body, { status: r.status });
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
