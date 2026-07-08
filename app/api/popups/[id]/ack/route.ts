// app/api/popups/[id]/ack/route.ts — 팝업 확인 기록. 멱등 (중복 클릭/다중 기기 안전).
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "login_required" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const supa = getServiceSupabase();
  const { data: popup } = await supa
    .from("popups")
    .select("id, target_user_id")
    .eq("id", id)
    .maybeSingle();
  // 내 대상이 아닌 팝업(남의 개별 팝업) ack 차단
  if (!popup || (popup.target_user_id !== null && popup.target_user_id !== userId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error } = await supa
    .from("popup_acks")
    .upsert(
      { popup_id: id, user_id: userId },
      { onConflict: "popup_id,user_id", ignoreDuplicates: true }
    );
  if (error) {
    return NextResponse.json({ error: "ack_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
