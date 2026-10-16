// 첫 충전 보너스 자격 조회 — 상점에서 배너/보너스 표기 여부 결정용.
// 서버가 권위(bonus_claims 원장) — 자격 없으면 화면에서 첫 충전 보너스를 숨긴다.
// 실제 지급 판정은 결제 confirm 라우트가 다시 하므로, 이 값은 표시용일 뿐이다.
// 원장 키 = 로그인 수단 해시(lib/auth/identity-hash.ts — 카카오는 옛 공식과 같은 값).

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getServiceSupabase } from "@/lib/supabase";
import { getUserIdentities, primaryIdentity } from "@/lib/auth/user-identity";
import { identityHash } from "@/lib/auth/identity-hash";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ eligible: false });

  try {
    const primary = primaryIdentity(await getUserIdentities(userId));
    if (!primary) return NextResponse.json({ eligible: false });

    const supabase = getServiceSupabase();
    const { data: claim } = await supabase
      .from("bonus_claims")
      .select("kakao_id_hash")
      .eq("kakao_id_hash", identityHash(primary.provider, primary.providerUserId))
      .eq("bonus_type", "first_charge")
      .maybeSingle();

    return NextResponse.json({ eligible: !claim });
  } catch {
    // 조회 실패 시 보수적으로 비노출(허위 프로모 방지)
    return NextResponse.json({ eligible: false });
  }
}
