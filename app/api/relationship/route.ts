// app/api/relationship/route.ts — 내 관계 조회 + 상대 등록
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { logError } from "@/lib/logger";
import { validateProfile } from "@/lib/saju/profile-input";
import { getActivePass, getTodayThreadTurns, getTodayExtendCount } from "@/lib/relationship/passes";
import { dailyTurnAllowance, type RelationshipStatus } from "@/lib/relationship/types";

export const dynamic = "force-dynamic";
const VALID_STATUS: RelationshipStatus[] = ["crush", "dating", "breakup", "onesided"];

export async function GET() {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ relationship: null }, { status: 200 });

  const supabase = getServiceSupabase();
  const { data: rel } = await supabase
    .from("relationships")
    .select("id, label, status, self_profile_id, partner_profile_id, thread_reading_id, memo, last_visited_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!rel) return NextResponse.json({ relationship: null });

  const pass = await getActivePass(rel.id);
  const todayTurns = pass ? await getTodayThreadTurns(rel.thread_reading_id) : 0;
  const todayExtend = pass ? await getTodayExtendCount(userId) : 0;

  // 스레드 메시지 히스토리 — 클라가 신규/재방문 판단 + 대화 렌더에 사용
  const { data: msgRows } = rel.thread_reading_id
    ? await supabase
        .from("messages")
        .select("role, content, created_at")
        .eq("reading_id", rel.thread_reading_id)
        .order("created_at", { ascending: true })
    : { data: [] };

  return NextResponse.json({
    relationship: {
      id: rel.id, label: rel.label, status: rel.status,
      selfProfileId: rel.self_profile_id, partnerProfileId: rel.partner_profile_id,
      threadReadingId: rel.thread_reading_id, memo: rel.memo,
    },
    pass: pass ? { kind: pass.kind, expiresAt: pass.expires_at } : null,
    daily: pass
      ? { used: todayTurns, allowance: dailyTurnAllowance(todayExtend), extendCount: todayExtend }
      : null,
    messages: msgRows ?? [],
  });
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

  // v1 단일 관계 — 이미 있으면 그대로 반환(멱등)
  const { data: existing } = await supabase
    .from("relationships").select("id").eq("user_id", userId).maybeSingle();
  if (existing) return NextResponse.json({ id: existing.id, existed: true });

  // self 프로필: 전달됐으면 소유권 확인, 없으면 null(나중에 등록 가능)
  let selfProfileId: string | null = null;
  if (typeof body.selfProfileId === "string" && body.selfProfileId) {
    const { data: owned } = await supabase.from("user_profiles")
      .select("id").eq("id", body.selfProfileId).eq("user_id", userId).maybeSingle();
    if (owned) selfProfileId = owned.id;
  }

  // partner 프로필: inline이면 검증 후 생성(relation_type='partner')
  // validateProfile 은 입력에 relationType 을 요구하므로 여기서 주입 (DB 저장은 항상 'partner' 고정)
  let partnerProfileId: string | null = null;
  if (body.partnerProfile) {
    const partnerInput =
      typeof body.partnerProfile === "object" && body.partnerProfile !== null
        ? { ...(body.partnerProfile as Record<string, unknown>), relationType: "partner" }
        : body.partnerProfile;
    const v = validateProfile(partnerInput);
    if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
    const { data: pRow, error: pErr } = await supabase.from("user_profiles").insert({
      user_id: userId, display_name: v.displayName, relation_type: "partner",
      birth_date: v.birthDate, birth_time: v.birthTime, is_lunar_input: v.isLunarInput,
      is_leap_month: v.isLeapMonth, gender: v.gender, is_primary: false,
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
  const { data: rel, error: rErr } = await supabase.from("relationships").insert({
    user_id: userId, label: body.label.trim(), status: body.status,
    self_profile_id: selfProfileId, partner_profile_id: partnerProfileId,
  }).select("id").single();
  if (rErr || !rel) {
    // 이번 요청에서 만든 partner 프로필만 롤백 (orphan 방지)
    if (partnerProfileId) await supabase.from("user_profiles").delete().eq("id", partnerProfileId);
    await logError(rErr ?? new Error("relationship insert null"), { route: "/api/relationship", userId, extra: { stage: "relationship_insert" } });
    return NextResponse.json({ error: "relationship_failed" }, { status: 500 });
  }

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
  label?: string;
  status?: RelationshipStatus;
  partnerProfile?: unknown; // 상대 생년월일 신규/교체
}

// 관계 수정 — 호칭·관계상태·상대 생년월일
export async function PATCH(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });

  let body: PatchBody;
  try { body = (await request.json()) as PatchBody; }
  catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const supabase = getServiceSupabase();
  const { data: rel } = await supabase
    .from("relationships")
    .select("id, partner_profile_id")
    .eq("user_id", userId)
    .maybeSingle();
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

  // 상대 생년월일 신규/교체 (validateProfile 은 relationType 요구 → 주입, 저장은 'partner' 고정)
  if (body.partnerProfile) {
    const partnerInput =
      typeof body.partnerProfile === "object" && body.partnerProfile !== null
        ? { ...(body.partnerProfile as Record<string, unknown>), relationType: "partner" }
        : body.partnerProfile;
    const v = validateProfile(partnerInput);
    if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });
    const profileFields = {
      display_name: v.displayName,
      relation_type: "partner",
      birth_date: v.birthDate,
      birth_time: v.birthTime,
      is_lunar_input: v.isLunarInput,
      is_leap_month: v.isLeapMonth,
      gender: v.gender,
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
