// 게스트 참여 — 비로그인 OK. shareId 로 map 찾고 member 추가.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { isValidBirthDate, isValidBirthTime } from "@/lib/byeoljari/validate";
import { logError } from "@/lib/logger";
import { MAX_STAR_MAP_MEMBERS } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RELATION_TYPES = ["friend", "lover", "acquaintance"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const { shareId } = await params;
  const { anonymousId } = await getSession();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_json" }, { status: 400 });
  }
  const b = body as {
    displayName?: unknown;
    birthDate?: unknown;
    birthTime?: unknown;
    relationType?: unknown;
    namePublic?: unknown;
    compatVisible?: unknown;
  };
  const displayName = typeof b.displayName === "string" ? b.displayName.trim() : "";
  const birthDate = typeof b.birthDate === "string" ? b.birthDate : "";
  const birthTime = typeof b.birthTime === "string" && b.birthTime ? b.birthTime : null;
  const relationType =
    typeof b.relationType === "string" && RELATION_TYPES.includes(b.relationType)
      ? b.relationType
      : "friend";
  const namePublic = b.namePublic === true;
  const compatVisible = b.compatVisible === true;
  if (!displayName || displayName.length > 50) {
    return NextResponse.json({ ok: false, reason: "name" }, { status: 400 });
  }
  if (!isValidBirthDate(birthDate)) {
    return NextResponse.json({ ok: false, reason: "birth" }, { status: 400 });
  }
  if (birthTime !== null && !isValidBirthTime(birthTime)) {
    return NextResponse.json({ ok: false, reason: "birth_time" }, { status: 400 });
  }

  const supa = getServiceSupabase();
  const { data: map, error: mapError } = await supa
    .from("star_maps")
    .select("id")
    .eq("share_id", shareId)
    .maybeSingle();
  if (mapError) {
    await logError(mapError, {
      route: "/api/fortune/byeoljari/[shareId]/join",
      extra: { severity: "BYEOLJARI_JOIN_LOOKUP_FAILED" },
    });
    return NextResponse.json({ ok: false, reason: "lookup" }, { status: 500 });
  }
  if (!map) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const { count, error: countError } = await supa
    .from("star_map_members")
    .select("id", { count: "exact", head: true })
    .eq("map_id", map.id);
  if (countError) {
    await logError(countError, {
      route: "/api/fortune/byeoljari/[shareId]/join",
      extra: { severity: "BYEOLJARI_JOIN_COUNT_FAILED" },
    });
    return NextResponse.json({ ok: false, reason: "lookup" }, { status: 500 });
  }
  if ((count ?? 0) >= MAX_STAR_MAP_MEMBERS) {
    return NextResponse.json({ ok: false, reason: "full" }, { status: 409 });
  }

  const { data: memberRow, error: insertError } = await supa
    .from("star_map_members")
    .insert({
      map_id: map.id,
      display_name: displayName,
      birth_date: birthDate,
      birth_time: birthTime,
      relation_type: relationType,
      member_anon_id: anonymousId ?? null,
      is_host: false,
      name_public: namePublic,
      compat_visible: compatVisible,
    })
    .select("id")
    .single();
  if (insertError || !memberRow) {
    await logError(insertError ?? new Error("join member row missing"), {
      route: "/api/fortune/byeoljari/[shareId]/join",
      extra: { severity: "BYEOLJARI_JOIN_FAILED" },
    });
    return NextResponse.json({ ok: false, reason: "save" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, memberId: memberRow.id });
}
