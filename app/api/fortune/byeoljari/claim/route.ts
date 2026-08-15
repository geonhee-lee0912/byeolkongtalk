// claim — 로그인 유저가 이 브라우저(anon)로 만든 미소유 지도를 승계.
// byeoljari 페이지 진입 시 로그인 상태면 호출(카카오 콜백 무수정).
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const { userId, anonymousId } = await getSession();
  if (!userId || !anonymousId) {
    return NextResponse.json({ ok: false, claimed: 0 });
  }
  const supa = getServiceSupabase();
  const { data, error } = await supa.rpc("claim_star_maps", {
    p_anon_id: anonymousId,
    p_user_id: userId,
  });
  if (error) {
    await logError(error, {
      route: "/api/fortune/byeoljari/claim",
      userId,
      extra: { severity: "BYEOLJARI_CLAIM_FAILED" },
    });
    return NextResponse.json({ ok: false, claimed: 0 }, { status: 500 });
  }
  return NextResponse.json({ ok: true, claimed: data ?? 0 });
}
