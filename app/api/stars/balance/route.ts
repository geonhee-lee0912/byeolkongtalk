// 현재 세션의 별 잔액 + 가입 선물을 아직 안 썼는지 + 입구 반반 그룹.
// entryArm = 익명 쿠키로 계산한 입구 그룹(비로그인만 — 스펙 2026-10-11-타로-로그인전-맛보기 §5-1).
// 표시·분기용이다 — 실제 차감은 각 라우트가 서버에서 다시 판단한다.

import { NextResponse } from "next/server";
import { getStarBalance, isWelcomeGiftUnused } from "@/lib/stars";
import { getSession } from "@/lib/session";
import { entryArmOf } from "@/lib/tarot/entry-ab";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId, anonymousId } = await getSession();
  if (!userId) {
    return NextResponse.json({
      balance: 0,
      isGuest: true,
      giftUnused: false,
      entryArm: entryArmOf(anonymousId),
    });
  }

  const [balance, giftUnused] = await Promise.all([
    getStarBalance(userId).catch(() => 0),
    // 확인 실패면 선물 없음으로 — 선물 약속을 틀리게 하지 않는 쪽
    isWelcomeGiftUnused(userId).catch(() => false),
  ]);

  return NextResponse.json({ balance, isGuest: false, giftUnused, entryArm: "old" });
}
