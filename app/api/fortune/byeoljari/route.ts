// 별자리 생성 — 비로그인 OK. 호스트 자기 별(is_host) 1개와 함께 map 생성.
// anon_id/user_id 는 서버 세션에서만(클라 불신, /api/survey 관행).
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { generateShareId } from "@/lib/byeoljari/share-id";
import { isValidBirthDate, isValidBirthTime } from "@/lib/byeoljari/validate";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 세션 소유자의 별자리 1개 조회(유저당 1개 모델). 로그인=owner_user_id / 비로그인=미claim anon.
// 방어적으로 최신 1개. 호스트 memberId 도 함께(뷰어=나 식별용 me-key).
async function findOwnMap(
  supa: ReturnType<typeof getServiceSupabase>,
  userId: string | null,
  anonymousId: string
): Promise<{ shareId: string; memberId: string | null } | null> {
  const base = supa
    .from("star_maps")
    .select("id, share_id")
    .order("created_at", { ascending: false })
    .limit(1);
  const { data: maps, error } = await (userId
    ? base.eq("owner_user_id", userId)
    : base.eq("creator_anon_id", anonymousId).is("owner_user_id", null));
  if (error || !maps || maps.length === 0) return null;
  const map = maps[0];
  const { data: host } = await supa
    .from("star_map_members")
    .select("id")
    .eq("map_id", map.id)
    .eq("is_host", true)
    .maybeSingle();
  return { shareId: map.share_id, memberId: host?.id ?? null };
}

export async function GET() {
  const { userId, anonymousId } = await getSession();
  if (!anonymousId) return NextResponse.json({ ok: true, map: null });
  const supa = getServiceSupabase();
  const map = await findOwnMap(supa, userId ?? null, anonymousId);
  return NextResponse.json({ ok: true, map });
}

export async function POST(req: NextRequest) {
  const { userId, anonymousId } = await getSession();
  if (!anonymousId) {
    // proxy.ts 가 항상 발급하지만 방어. anon 없으면 귀속 불가.
    return NextResponse.json({ ok: false, reason: "no_session" }, { status: 400 });
  }

  const supa = getServiceSupabase();
  const existing = await findOwnMap(supa, userId ?? null, anonymousId);
  if (existing) {
    return NextResponse.json({
      ok: true,
      shareId: existing.shareId,
      memberId: existing.memberId,
      existing: true,
    });
  }

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
    namePublic?: unknown;
  };
  const displayName = typeof b.displayName === "string" ? b.displayName.trim() : "";
  const birthDate = typeof b.birthDate === "string" ? b.birthDate : "";
  const birthTime = typeof b.birthTime === "string" && b.birthTime ? b.birthTime : null;
  // 호스트는 기본 이름 공개(맵 주인이라 옵트아웃 방식) — 명시적 false 만 숨김.
  const namePublic = b.namePublic === false ? false : true;
  if (!displayName || displayName.length > 50) {
    return NextResponse.json({ ok: false, reason: "name" }, { status: 400 });
  }
  if (!isValidBirthDate(birthDate)) {
    return NextResponse.json({ ok: false, reason: "birth" }, { status: 400 });
  }
  if (birthTime !== null && !isValidBirthTime(birthTime)) {
    return NextResponse.json({ ok: false, reason: "birth_time" }, { status: 400 });
  }

  // share_id UNIQUE 충돌 재시도(최대 5회)
  let mapId: string | null = null;
  let shareId = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    shareId = generateShareId();
    const { data, error } = await supa
      .from("star_maps")
      .insert({
        share_id: shareId,
        owner_user_id: userId ?? null,
        creator_anon_id: anonymousId,
      })
      .select("id")
      .single();
    if (!error && data) {
      mapId = data.id;
      break;
    }
    if (error && error.code !== "23505") {
      await logError(error, {
        route: "/api/fortune/byeoljari",
        userId,
        extra: { severity: "BYEOLJARI_CREATE_FAILED" },
      });
      return NextResponse.json({ ok: false, reason: "save" }, { status: 500 });
    }
    // 23505 = share_id 충돌 → 다음 시도
  }
  if (!mapId) {
    return NextResponse.json({ ok: false, reason: "share_id" }, { status: 500 });
  }

  const { data: memberRow, error: memberError } = await supa
    .from("star_map_members")
    .insert({
      map_id: mapId,
      display_name: displayName,
      birth_date: birthDate,
      birth_time: birthTime,
      relation_type: "friend",
      member_anon_id: anonymousId,
      is_host: true,
      name_public: namePublic,
    })
    .select("id")
    .single();
  if (memberError || !memberRow) {
    await logError(memberError ?? new Error("host member row missing"), {
      route: "/api/fortune/byeoljari",
      userId,
      extra: { severity: "BYEOLJARI_HOST_MEMBER_FAILED" },
    });
    return NextResponse.json({ ok: false, reason: "member" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, shareId, memberId: memberRow.id });
}
