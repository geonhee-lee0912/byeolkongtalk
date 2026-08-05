// app/api/relationship/route.ts — 내 관계 조회 + 상대 등록
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { logError } from "@/lib/logger";
import { validateProfile } from "@/lib/saju/profile-input";
import { getActivePass, getTodayThreadTurns, getTodayExtendCount } from "@/lib/relationship/passes";
import { dailyTurnAllowance, SLOT_COST, type RelationshipStatus, type RelationshipMemo } from "@/lib/relationship/types";

export const dynamic = "force-dynamic";
const VALID_STATUS: RelationshipStatus[] = ["crush", "dating", "breakup", "onesided"];

// 사람 프로필(self·상대) 카멜케이스 뷰 — GET 응답 계약(Task 6·8 소비). 생일·MBTI·성격은 옵션(null 가능).
interface PersonProfile {
  id: string;
  displayName: string;
  birthDate: string | null;
  birthTime: string | null;
  isLunarInput: boolean;
  isLeapMonth: boolean;
  gender: string;
  mbti: string | null;
  personality: string | null;
}
function toPersonProfile(row: {
  id: string;
  display_name: string;
  birth_date: string | null;
  birth_time: string | null;
  is_lunar_input: boolean;
  is_leap_month: boolean;
  gender: string;
  mbti: string | null;
  personality: string | null;
}): PersonProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    birthDate: row.birth_date,
    birthTime: row.birth_time,
    isLunarInput: row.is_lunar_input,
    isLeapMonth: row.is_leap_month,
    gender: row.gender,
    mbti: row.mbti,
    personality: row.personality,
  };
}

const PROFILE_COLS =
  "id, display_name, birth_date, birth_time, is_lunar_input, is_leap_month, gender, mbti, personality";

// GET /api/relationship[?selectedId=<id>]
// 관계 전체 목록 + 선택된 관계(선택 인자 없으면 최근) 한 건의 pass/daily/messages/activeSkill + self 프로필.
// 순수 읽기 — last_visited_at 갱신 없음. selectedId 가 미소유면 최근 관계로 폴백(에러 아님).
export async function GET(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId)
    return NextResponse.json(
      { relationships: [], selectedId: null, self: null, pass: null, daily: null, messages: [], activeSkill: null },
      { status: 200 }
    );

  const supabase = getServiceSupabase();

  // 유저의 모든 관계 (최근 방문 → 생성 순)
  const { data: relRows } = await supabase
    .from("relationships")
    .select("id, label, status, self_profile_id, partner_profile_id, thread_reading_id, memo")
    .eq("user_id", userId)
    .order("last_visited_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  const rels = relRows ?? [];

  // 상대 프로필 일괄 조회(소유권 필터) → id 로 매핑
  const partnerIds = rels
    .map((r) => r.partner_profile_id)
    .filter((v): v is string => typeof v === "string");
  const partnerById = new Map<string, PersonProfile>();
  if (partnerIds.length > 0) {
    const { data: pRows } = await supabase
      .from("user_profiles")
      .select(PROFILE_COLS)
      .in("id", partnerIds)
      .eq("user_id", userId);
    for (const row of pRows ?? []) partnerById.set(row.id, toPersonProfile(row));
  }

  // self 프로필(is_primary) — 관계와 독립적으로 해석
  const { data: selfRow } = await supabase
    .from("user_profiles")
    .select(PROFILE_COLS)
    .eq("user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  const self = selfRow ? toPersonProfile(selfRow) : null;

  const relationships = rels.map((r) => ({
    id: r.id,
    label: r.label,
    status: r.status,
    selfProfileId: r.self_profile_id,
    partnerProfileId: r.partner_profile_id,
    threadReadingId: r.thread_reading_id,
    partner: r.partner_profile_id ? partnerById.get(r.partner_profile_id) ?? null : null,
  }));

  // 선택 관계: ?selectedId 가 소유한 것이면 그것, 아니면 최근(첫) 것. 없으면 null.
  const requestedId = new URL(request.url).searchParams.get("selectedId");
  const selected =
    (requestedId ? rels.find((r) => r.id === requestedId) : undefined) ?? rels[0] ?? null;
  const selectedId = selected ? selected.id : null;

  // 선택 관계에 대해서만 pass/daily/messages/activeSkill 계산(오늘과 동일 — 한 관계 분량).
  let pass: { kind: string; expiresAt: string } | null = null;
  let daily: { used: number; allowance: number; extendCount: number } | null = null;
  let messages: unknown[] = [];
  let activeSkill: string | null = null;
  if (selected) {
    const activePass = await getActivePass(selected.id);
    const todayTurns = activePass ? await getTodayThreadTurns(selected.thread_reading_id) : 0;
    const todayExtend = activePass ? await getTodayExtendCount(userId) : 0;

    // 스레드 메시지 히스토리 — 클라가 신규/재방문 판단 + 대화 렌더에 사용
    const { data: msgRows } = selected.thread_reading_id
      ? await supabase
          .from("messages")
          .select("role, content, created_at")
          .eq("reading_id", selected.thread_reading_id)
          .order("created_at", { ascending: true })
      : { data: [] };

    const memoData = selected.memo as RelationshipMemo | null;
    pass = activePass ? { kind: activePass.kind, expiresAt: activePass.expires_at } : null;
    daily = activePass
      ? { used: todayTurns, allowance: dailyTurnAllowance(todayExtend), extendCount: todayExtend }
      : null;
    messages = msgRows ?? [];
    activeSkill = memoData?.active_skill?.key ?? null;
  }

  return NextResponse.json({ relationships, selectedId, self, pass, daily, messages, activeSkill });
}

interface RegisterBody {
  label: string;
  status: RelationshipStatus;
  selfProfileId?: string;        // 기존 primary 재사용
  partnerProfile?: unknown;       // inline 등록 (relation_type='partner')
}

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });

  let body: RegisterBody;
  try { body = (await request.json()) as RegisterBody; }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  if (typeof body.label !== "string" || body.label.trim().length < 1 || body.label.length > 50)
    return NextResponse.json({ error: "invalid_label" }, { status: 400 });
  if (!VALID_STATUS.includes(body.status))
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });

  const supabase = getServiceSupabase();

  // self 프로필: 전달됐으면 소유권 확인. 미전달/미소유면 유저 is_primary 프로필로 자동 연결
  // (구 RegisterOnboarding useMyProfile 기본 동작 복원 — 우리궁합 스킬이 rel.self_profile_id 를
  // 하드 게이트하므로 서버가 권위적으로 채운다). primary 가 없으면 null(사주 미등록 = 정상 게이트).
  let selfProfileId: string | null = null;
  if (typeof body.selfProfileId === "string" && body.selfProfileId) {
    const { data: owned } = await supabase.from("user_profiles")
      .select("id").eq("id", body.selfProfileId).eq("user_id", userId).maybeSingle();
    if (owned) selfProfileId = owned.id;
  }
  if (!selfProfileId) {
    const { data: primary } = await supabase.from("user_profiles")
      .select("id").eq("user_id", userId).eq("is_primary", true).maybeSingle();
    if (primary) selfProfileId = primary.id;
  }

  // partner 프로필: inline이면 검증 후 생성(relation_type='partner')
  // validateProfile 은 입력에 relationType 을 요구하므로 여기서 주입 (DB 저장은 항상 'partner' 고정)
  let partnerProfileId: string | null = null;
  if (body.partnerProfile) {
    const partnerInput =
      typeof body.partnerProfile === "object" && body.partnerProfile !== null
        ? { ...(body.partnerProfile as Record<string, unknown>), relationType: "partner" }
        : body.partnerProfile;
    // 생일은 옵션(P2) — 이름+관계가 등록 게이트. birth_date/birth_time 은 null 저장 가능.
    const v = validateProfile(partnerInput, { optionalBirth: true });
    if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
    const { data: pRow, error: pErr } = await supabase.from("user_profiles").insert({
      user_id: userId, display_name: v.displayName, relation_type: "partner",
      birth_date: v.birthDate, birth_time: v.birthTime, is_lunar_input: v.isLunarInput,
      is_leap_month: v.isLeapMonth, gender: v.gender, mbti: v.mbti, personality: v.personality,
      is_primary: false,
    }).select("id").single();
    if (pErr || !pRow) {
      await logError(pErr ?? new Error("partner profile insert null"), {
        route: "/api/relationship",
        userId,
        extra: { stage: "partner_profile" },
      });
      return NextResponse.json({ error: "partner_profile_failed" }, { status: 500 });
    }
    partnerProfileId = pRow.id;
  }

  // 관계 + 스레드 본체 reading 생성 (스레드는 무료 — 패스가 대화를 게이트)
  const { data: created, error: rErr } = await supabase.rpc("create_relationship", {
    p_user_id: userId, p_label: body.label.trim(), p_status: body.status,
    p_self_profile_id: selfProfileId, p_partner_profile_id: partnerProfileId,
  });
  if (rErr || !created?.success) {
    // 이번 요청에서 만든 partner 프로필만 롤백 (orphan 방지)
    if (partnerProfileId) await supabase.from("user_profiles").delete().eq("id", partnerProfileId);
    // 허용량 초과는 402(슬롯 필요), 그 외는 500
    if (!rErr && created?.reason === "slot_required") {
      return NextResponse.json(
        { error: "slot_required", code: "SLOT_REQUIRED", nextCost: SLOT_COST },
        { status: 402 }
      );
    }
    await logError(rErr ?? new Error("create_relationship failed"), { route: "/api/relationship", userId, extra: { stage: "relationship_create" } });
    return NextResponse.json({ error: "relationship_failed" }, { status: 500 });
  }
  const rel = { id: created.id as string };

  const { data: thread, error: tErr } = await supabase.from("readings").insert({
    user_id: userId, consultation_type: "relationship", relationship_id: rel.id,
    profile_id: null, saju_data: null, stars_spent: 0, has_sensitive: false,
  }).select("id").single();
  if (tErr || !thread) {
    await supabase.from("relationships").delete().eq("id", rel.id);
    if (partnerProfileId) await supabase.from("user_profiles").delete().eq("id", partnerProfileId);
    await logError(tErr ?? new Error("thread reading insert null"), {
      route: "/api/relationship",
      userId,
      extra: { stage: "thread_reading" },
    });
    return NextResponse.json({ error: "thread_failed" }, { status: 500 });
  }
  await supabase.from("relationships").update({ thread_reading_id: thread.id }).eq("id", rel.id);

  return NextResponse.json({ id: rel.id, threadReadingId: thread.id, success: true });
}

interface PatchBody {
  target?: "me";            // "me" 면 self 프로필 upsert 분기
  selfProfile?: unknown;    // self 프로필(생일 옵션 + mbti/personality)
  relationshipId?: string;  // 대상 관계 지정(미지정/미소유 시 최근 관계로 폴백 — 하위호환)
  label?: string;
  status?: RelationshipStatus;
  partnerProfile?: unknown; // 상대 프로필 신규/교체(생일 옵션 + mbti/personality)
}

// 관계 수정 — self 프로필 upsert(target:"me") 또는 관계(호칭·상태·상대 프로필).
export async function PATCH(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });

  let body: PatchBody;
  try { body = (await request.json()) as PatchBody; }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const supabase = getServiceSupabase();

  // self 분기 — is_primary 프로필 upsert(생일 옵션 + mbti/personality). 관계와 무관.
  if (body.target === "me") {
    const selfInput =
      typeof body.selfProfile === "object" && body.selfProfile !== null
        ? { ...(body.selfProfile as Record<string, unknown>), relationType: "self" }
        : body.selfProfile;
    const v = validateProfile(selfInput, { optionalBirth: true });
    if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });

    const profileFields = {
      display_name: v.displayName,
      relation_type: "self",
      birth_date: v.birthDate,
      birth_time: v.birthTime,
      is_lunar_input: v.isLunarInput,
      is_leap_month: v.isLeapMonth,
      gender: v.gender,
      mbti: v.mbti,
      personality: v.personality,
    };

    // 기존 primary 있으면 UPDATE, 없으면 INSERT (partial unique index: user 당 primary 1개 보장).
    const { data: existing } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .maybeSingle();

    if (existing) {
      const { error: uErr } = await supabase
        .from("user_profiles")
        .update({ ...profileFields, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .eq("user_id", userId);
      if (uErr) {
        await logError(uErr, { route: "/api/relationship", userId, extra: { stage: "self_update" } });
        return NextResponse.json({ error: "self_profile_failed" }, { status: 500 });
      }
      return NextResponse.json({ success: true, selfProfileId: existing.id });
    }
    const { data: sRow, error: sErr } = await supabase
      .from("user_profiles")
      .insert({ user_id: userId, ...profileFields, is_primary: true })
      .select("id")
      .single();
    if (sErr || !sRow) {
      await logError(sErr ?? new Error("self profile insert null"), { route: "/api/relationship", userId, extra: { stage: "self_insert" } });
      return NextResponse.json({ error: "self_profile_failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true, selfProfileId: sRow.id });
  }

  // 관계 분기 — relationshipId 지정 시 소유권 확인, 아니면(미소유 포함) 최근 관계로 폴백.
  let rel: { id: string; partner_profile_id: string | null } | null = null;
  if (typeof body.relationshipId === "string" && body.relationshipId) {
    const { data } = await supabase
      .from("relationships")
      .select("id, partner_profile_id")
      .eq("id", body.relationshipId)
      .eq("user_id", userId)
      .maybeSingle();
    rel = data ?? null;
  }
  if (!rel) {
    const { data } = await supabase
      .from("relationships")
      .select("id, partner_profile_id")
      .eq("user_id", userId)
      .order("last_visited_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    rel = data ?? null;
  }
  if (!rel) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (body.label !== undefined) {
    if (typeof body.label !== "string" || body.label.trim().length < 1 || body.label.length > 50)
      return NextResponse.json({ error: "invalid_label" }, { status: 400 });
    updates.label = body.label.trim();
  }
  if (body.status !== undefined) {
    if (!VALID_STATUS.includes(body.status))
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    updates.status = body.status;
  }

  // 상대 프로필 신규/교체 — 생일 옵션(P2) + mbti/personality. 저장 relation_type 은 'partner' 고정.
  if (body.partnerProfile) {
    const partnerInput =
      typeof body.partnerProfile === "object" && body.partnerProfile !== null
        ? { ...(body.partnerProfile as Record<string, unknown>), relationType: "partner" }
        : body.partnerProfile;
    const v = validateProfile(partnerInput, { optionalBirth: true });
    if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
    const profileFields = {
      display_name: v.displayName,
      relation_type: "partner",
      birth_date: v.birthDate,
      birth_time: v.birthTime,
      is_lunar_input: v.isLunarInput,
      is_leap_month: v.isLeapMonth,
      gender: v.gender,
      mbti: v.mbti,
      personality: v.personality,
    };
    if (rel.partner_profile_id) {
      const { error: uErr } = await supabase
        .from("user_profiles")
        .update({ ...profileFields, updated_at: new Date().toISOString() })
        .eq("id", rel.partner_profile_id)
        .eq("user_id", userId);
      if (uErr) {
        await logError(uErr, { route: "/api/relationship", userId, extra: { stage: "partner_update" } });
        return NextResponse.json({ error: "partner_profile_failed" }, { status: 500 });
      }
    } else {
      const { data: pRow, error: pErr } = await supabase
        .from("user_profiles")
        .insert({ user_id: userId, ...profileFields, is_primary: false })
        .select("id")
        .single();
      if (pErr || !pRow) {
        await logError(pErr ?? new Error("partner profile insert null"), { route: "/api/relationship", userId, extra: { stage: "partner_insert_patch" } });
        return NextResponse.json({ error: "partner_profile_failed" }, { status: 500 });
      }
      updates.partner_profile_id = pRow.id;
    }
  }

  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
    const { error: rErr } = await supabase.from("relationships").update(updates).eq("id", rel.id);
    if (rErr) {
      await logError(rErr, { route: "/api/relationship", userId, extra: { stage: "relationship_update" } });
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
