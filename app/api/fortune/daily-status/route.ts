// 오늘의 운세 — 전면 무료·하루 1회. 오늘(KST) 이미 본 리딩 id 를 돌려준다(있으면 결과로 바로 이동).

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { findTodaysDailyReadingId } from "@/lib/fortune/daily-lookup";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ todayId: null });
  }
  const todayId = await findTodaysDailyReadingId(userId);
  return NextResponse.json({ todayId });
}
