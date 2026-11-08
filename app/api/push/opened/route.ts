// 앱을 연 시각(아침 알림 14일 멈춤·깨우기) + 알림을 눌러 연 발송의 열람 시각. 웹뷰 쿠키 세션.
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { logError, ctxFromRequest } from "@/lib/logger";
import { markSendOpened, recordAppOpen } from "@/lib/push/store";
import { handleOpenedPost } from "@/lib/push/user-api";

const ROUTE = "/api/push/opened";

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  try {
    const r = await handleOpenedPost(await readJson(request), userId ?? null, { recordAppOpen, markSendOpened });
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: ROUTE, userId: userId ?? undefined }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
