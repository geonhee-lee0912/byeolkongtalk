// app/api/byeolmaru/checkin/route.ts — 오늘 출석(하루 1회, 멱등). 로그인 유저면 누구나(습관은 전 유저).
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { kstDate } from "@/lib/admin-time";
import { recordCheckin } from "@/lib/byeolmaru/attendance";

export const runtime = "nodejs";

export async function POST() {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "login_required" }, { status: 401 });
  const attendance = await recordCheckin(userId, kstDate(new Date().toISOString()));
  return NextResponse.json({ ok: true, attendance });
}
