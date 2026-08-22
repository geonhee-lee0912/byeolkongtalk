// 별자리 조회 — 무인증 공유용. PII(birth_date) 미반환, pairRelation 그래프만.
// P3(렌더)가 이 출력을 별자리 SVG 로 그린다.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { calcSaju } from "@/lib/saju/calc";
import { pairRelation, findTriads } from "@/lib/saju/pairing";
import { inyeonScore } from "@/lib/byeoljari/inyeon";
import { dayType } from "@/lib/byeoljari/day-type";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const { shareId } = await params;
  const supa = getServiceSupabase();

  const { data: map, error: mapError } = await supa
    .from("star_maps")
    .select("id, share_id, owner_user_id, creator_anon_id")
    .eq("share_id", shareId)
    .maybeSingle();
  if (mapError) {
    await logError(mapError, {
      route: "/api/fortune/byeoljari/[shareId]",
      extra: { severity: "BYEOLJARI_GET_LOOKUP_FAILED" },
    });
    return NextResponse.json({ ok: false, reason: "lookup" }, { status: 500 });
  }
  if (!map) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  // 뷰어=맵 주인 여부(서버 권위). 지우기 등 주인 전용 UI 게이팅용 — DELETE 라우트와 동일 기준.
  const { userId, anonymousId } = await getSession();
  const viewerIsOwner = map.owner_user_id
    ? map.owner_user_id === userId
    : map.creator_anon_id === anonymousId;

  const { data: rows, error: memErr } = await supa
    .from("star_map_members")
    .select(
      "id, display_name, birth_date, birth_time, relation_type, is_host, name_public, created_at"
    )
    .eq("map_id", map.id)
    .order("created_at", { ascending: true });
  if (memErr) {
    await logError(memErr, {
      route: "/api/fortune/byeoljari/[shareId]",
      extra: { severity: "BYEOLJARI_GET_MEMBERS_FAILED" },
    });
    return NextResponse.json({ ok: false, reason: "members" }, { status: 500 });
  }
  const members = rows ?? [];

  // 각 멤버 사주 계산(조회 시 재계산, 캐시 없음). gender 는 지표 무관 → "other".
  const saju = members.map((m) => {
    const [y, mo, d] = m.birth_date.split("-").map(Number);
    let hour: number | null = null;
    let minute: number | null = null;
    if (m.birth_time) {
      const [hh, mm] = m.birth_time.split(":").map(Number);
      hour = hh;
      minute = mm;
    }
    return calcSaju({ year: y, month: mo, day: d, hour, minute, gender: "other" });
  });

  // 쌍별 관계(방향성 있으니 i→j 전부). PII 미반환: birth_date 제외.
  const nodes = members.map((m, i) => ({
    id: m.id,
    name: m.name_public ? m.display_name : null, // 옵트인 아니면 이름 숨김(별만)
    isHost: m.is_host,
    relationType: m.relation_type,
    element: saju[i].dayElement,
    dayType: dayType(saju[i].dayStem, saju[i].pillars.month.branch),
  }));

  // 삼합 먼저 계산(각 edge 의 triadShared 판정에 필요)
  const triads = findTriads(saju.map((s) => s.pillars.day.branch)).map((t) => ({
    element: t.element,
    memberIds: members
      .filter((_, i) => t.branches.includes(saju[i].pillars.day.branch))
      .map((m) => m.id),
  }));
  const triadSets = triads.map((t) => new Set(t.memberIds));

  const edges: Array<{
    a: string;
    b: string;
    element: string;
    labelAtoB: string;
    labelBtoA: string;
    tenGodAtoB: string;
    tenGodBtoA: string;
    inyeon: number;
    triadShared: boolean;
    heavenlyCombo: boolean;
    sixCombo: boolean;
  }> = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const r = pairRelation(saju[i], saju[j]);
      const host = members[i].is_host || members[j].is_host;
      const special = r.heavenlyCombo || r.sixCombo;
      // 호스트 낀 엣지는 순위·점수용으로 전부. 게스트끼리는 특별 인연(끌림/결속)만 지도에 노출.
      if (!host && !special) continue;
      const triadShared = triadSets.some(
        (s) => s.has(members[i].id) && s.has(members[j].id)
      );
      edges.push({
        a: members[i].id,
        b: members[j].id,
        element: r.element,
        labelAtoB: r.labelAtoB,
        labelBtoA: r.labelBtoA,
        tenGodAtoB: r.tenGodAtoB,
        tenGodBtoA: r.tenGodBtoA,
        inyeon: inyeonScore({
          element: r.element,
          heavenlyCombo: r.heavenlyCombo,
          sixCombo: r.sixCombo,
          triadShared,
          tenGodAtoB: r.tenGodAtoB,
          tenGodBtoA: r.tenGodBtoA,
        }),
        triadShared,
        heavenlyCombo: r.heavenlyCombo,
        sixCombo: r.sixCombo,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    shareId: map.share_id,
    claimed: !!map.owner_user_id,
    viewerIsOwner,
    nodes,
    edges,
    triads,
  });
}
