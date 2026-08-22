// 별자리 멤버 삭제 — 주인(owner)만. 호스트(나) 삭제 금지.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ shareId: string; memberId: string }> }
) {
  const { shareId, memberId } = await params;
  const { userId, anonymousId } = await getSession();
  if (!anonymousId) {
    return NextResponse.json({ ok: false, reason: "no_session" }, { status: 401 });
  }

  const supa = getServiceSupabase();
  const { data: map } = await supa
    .from("star_maps")
    .select("id, owner_user_id, creator_anon_id")
    .eq("share_id", shareId)
    .maybeSingle();
  if (!map) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  // 주인 검증: 로그인 맵=owner_user_id 일치 / 비로그인 맵=creator_anon_id 일치
  const isOwner = map.owner_user_id
    ? map.owner_user_id === userId
    : map.creator_anon_id === anonymousId;
  if (!isOwner) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  }

  const { data: member } = await supa
    .from("star_map_members")
    .select("id, map_id, is_host")
    .eq("id", memberId)
    .maybeSingle();
  if (!member || member.map_id !== map.id) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }
  if (member.is_host) {
    return NextResponse.json({ ok: false, reason: "host" }, { status: 409 });
  }

  const { error } = await supa.from("star_map_members").delete().eq("id", memberId);
  if (error) {
    await logError(error, {
      route: "/api/fortune/byeoljari/[shareId]/members/[memberId]",
      userId,
      extra: { severity: "BYEOLJARI_MEMBER_DELETE_FAILED" },
    });
    return NextResponse.json({ ok: false, reason: "delete" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
