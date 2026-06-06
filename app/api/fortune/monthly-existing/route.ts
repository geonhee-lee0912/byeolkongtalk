// 로그인 유저가 이번 달(KST) 이미 본 monthly 리딩을 profile_id → readingId 맵으로 반환.
// 사주 선택 화면에서 '이번 달 운세 다시보기' CTA 판별에 사용.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { findThisMonthMonthlyByProfile } from "@/lib/fortune/monthly-lookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json(
      { error: "Login required", code: "LOGIN_REQUIRED" },
      { status: 401 }
    );
  }
  const existing = await findThisMonthMonthlyByProfile(userId);
  return NextResponse.json({ existing });
}
