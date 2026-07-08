// app/api/popups/route.ts — 내가 볼 미확인 팝업 중 가장 오래된 1건.
// 미로그인은 200 + popup:null (익명 방문마다 401 콘솔 노이즈 방지).
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ popup: null });

  const supa = getServiceSupabase();
  const { data: candidates } = await supa
    .from("popups")
    .select("id, title, body")
    .or(`target_user_id.eq.${userId},target_user_id.is.null`)
    .order("created_at", { ascending: true })
    .limit(20);
  if (!candidates?.length) return NextResponse.json({ popup: null });

  const { data: acks } = await supa
    .from("popup_acks")
    .select("popup_id")
    .eq("user_id", userId)
    .in(
      "popup_id",
      candidates.map((p) => p.id)
    );
  const acked = new Set((acks ?? []).map((a) => a.popup_id));
  const next = candidates.find((p) => !acked.has(p.id)) ?? null;

  return NextResponse.json({ popup: next });
}
