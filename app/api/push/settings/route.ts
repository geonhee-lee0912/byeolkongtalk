// 알림 설정 — 다시 볼 날 칸, 광고성 정보 수신 동의(결과 통지 포함), 2년 재확인 팝업 기록. 웹뷰 쿠키 세션.
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { logError, ctxFromRequest } from "@/lib/logger";
import { getAdConsent, getRevisitPref, recordReconfirmNotice, setAdConsent, setRevisitPref } from "@/lib/push/store";
import { handleSettingsGet, handleSettingsPost } from "@/lib/push/user-api";

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
  try {
    const r = await handleSettingsGet(userId ?? null, { getRevisitPref, getAdConsent, now: () => new Date() });
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: ROUTE, userId: userId ?? undefined }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  try {
    const r = await handleSettingsPost(await readJson(request), userId ?? null, {
      setRevisitPref,
      setAdConsent: (u, grant, source) => setAdConsent(u, grant, source),
      recordReconfirmNotice,
    });
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: ROUTE, userId: userId ?? undefined }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
