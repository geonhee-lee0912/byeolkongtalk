// 현재 세션의 별 잔액 + 가입 선물을 아직 안 썼는지 + 반반 비교 그룹.
// giftUnused = 별을 한 번도 쓴 적 없음(메뉴판 "선물로 무료") · menuArm = user_id 로 계산한 그룹(비로그인 = 옛).
// 표시·분기용이다 — 실제 차감은 각 라우트가 서버에서 다시 판단한다. 스펙 2026-10-05-타로톡-메뉴판-별경제 §5-3 · §9-1

import { NextResponse } from "next/server";
import { getStarBalance, hasSpentStars } from "@/lib/stars";
import { getSession } from "@/lib/session";
import { menuArmOf } from "@/lib/tarot/menu-ab";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ balance: 0, isGuest: true, giftUnused: false, menuArm: menuArmOf(null) });
  }

  const [balance, spent] = await Promise.all([
    getStarBalance(userId).catch(() => 0),
    // 확인 실패면 "썼다"로 — 선물 약속을 틀리게 하지 않는 쪽
    hasSpentStars(userId).catch(() => true),
  ]);

  return NextResponse.json({ balance, isGuest: false, giftUnused: !spent, menuArm: menuArmOf(userId) });
}
