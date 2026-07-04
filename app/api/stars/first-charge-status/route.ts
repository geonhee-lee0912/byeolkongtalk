// 첫 충전 보너스 자격 조회 — 상점에서 배너/보너스 표기 여부 결정용.
// 서버가 권위(bonus_claims 원장) — 자격 없으면 화면에서 첫 충전 보너스를 숨긴다.
// 실제 지급 판정은 결제 confirm 라우트가 다시 하므로, 이 값은 표시용일 뿐이다.

import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSession } from "@/lib/session";
import { getServiceSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ eligible: false });

  try {
    const supabase = getServiceSupabase();
    const { data: userRow } = await supabase
      .from("users")
      .select("kakao_id")
      .eq("id", userId)
      .single();
    if (!userRow?.kakao_id) return NextResponse.json({ eligible: false });

    const kakaoIdHash = createHash("sha256")
      .update(String(userRow.kakao_id))
      .digest("hex");
    const { data: claim } = await supabase
      .from("bonus_claims")
      .select("kakao_id_hash")
      .eq("kakao_id_hash", kakaoIdHash)
      .eq("bonus_type", "first_charge")
      .maybeSingle();

    return NextResponse.json({ eligible: !claim });
  } catch {
    // 조회 실패 시 보수적으로 비노출(허위 프로모 방지)
    return NextResponse.json({ eligible: false });
  }
}
