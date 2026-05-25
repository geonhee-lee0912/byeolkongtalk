// 현재 세션의 별 잔액 조회.
// Phase 4 (c) 시점: 잔액만 반환. 사주 도메인 무료 정책 (Phase 5) 은 별도 라우트/필드로 추가.

import { NextResponse } from "next/server";
import { getStarBalance } from "@/lib/stars";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await getSession();

  const balance = userId
    ? await getStarBalance(userId).catch(() => 0)
    : 0;

  return NextResponse.json({
    balance,
    isGuest: !userId,
  });
}
