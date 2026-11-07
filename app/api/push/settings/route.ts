// 알림 설정 — 다시 볼 날 알림 켬/끔. 웹뷰 쿠키 세션.
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { logError, ctxFromRequest } from "@/lib/logger";
import { getRevisitPref, setRevisitPref } from "@/lib/push/store";
import { handleSettingsPost } from "@/lib/push/user-api";

const ROUTE = "/api/push/settings";

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
    return NextResponse.json({ revisit: await getRevisitPref(userId) });
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: ROUTE, userId }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  try {
    const r = await handleSettingsPost(await readJson(request), userId ?? null, { setRevisitPref });
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: ROUTE, userId: userId ?? undefined }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
