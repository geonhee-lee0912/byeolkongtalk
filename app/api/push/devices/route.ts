// 앱 푸시 기기 등록·해제. POST 는 앱 Bearer 토큰 필요, DELETE 는 토큰만 알면 된다.
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { logError, ctxFromRequest } from "@/lib/logger";
import { handleDevicePost, handleDeviceDelete } from "@/lib/push/devices";
import { rateLimited } from "@/lib/auth/app-route";

const ROUTE = "/api/push/devices";

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  // 앱은 실행·로그인 때 한 번 등록한다 — 1분에 10번이면 넉넉하다. 대량 등록은 회원별 기기 상한이 또 막는다
  const limited = rateLimited(request, "push-devices", 10);
  if (limited) return limited;
  const { userId } = await getSession();
  try {
    const r = await handleDevicePost(await readJson(request), userId ?? null);
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: ROUTE, userId: userId ?? undefined }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const r = await handleDeviceDelete(await readJson(request));
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    await logError(err, ctxFromRequest(request, { route: ROUTE }));
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
