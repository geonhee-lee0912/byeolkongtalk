// 광고 알림 수신거부 — 로그인 없이 알림에 실린 서명된 1회용 표만 본다(설계 §4-7). 표는 lib/push/unsub-token.ts.
import { NextResponse, type NextRequest } from "next/server";
import { logError, ctxFromRequest } from "@/lib/logger";
import { sendOwner, setAdConsent } from "@/lib/push/store";
import { handleUnsubscribePost } from "@/lib/push/user-api";

const ROUTE = "/api/push/unsubscribe";

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const r = await handleUnsubscribePost(await readJson(request), {
      sendOwner,
      setAdConsent: (u, grant, source, sendId) => setAdConsent(u, grant, source, sendId),
    });
    return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: ROUTE }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
