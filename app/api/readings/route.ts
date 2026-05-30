// readings INSERT — 사주 풀이 세션 시작 시 호출.
//
// 흐름: 입력 검증 → 잔액 사전 확인 → user_profiles INSERT → readings INSERT → spendStars(22)
//      → 실패 시 readings/profile 롤백.
//
// Phase 5 (c) 시점: 자기 사주만 입력 (isPrimary 결정 = user 의 첫 self profile 인지). 가족/지인은 추후.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { spendStars, getStarBalance } from "@/lib/stars";
import { SAJU_READING_COST } from "@/lib/saju/constants";
import { logError, ctxFromRequest } from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET /api/readings — 본인 readings 리스트 (마이페이지용)
export async function GET() {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ readings: [] });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("readings")
    .select(
      "id, question, saju_data, consultation_type, spread_type, emotion_tag, stars_spent, has_sensitive, created_at, profile:user_profiles(display_name, relation_type)"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ readings: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    readings: (data ?? []).map((r) => ({
      id: r.id,
      question: r.question,
      sajuData: r.saju_data,
      consultationType: r.consultation_type,
      spreadType: r.spread_type,
      emotionTag: r.emotion_tag,
      starsSpent: r.stars_spent,
      hasSensitive: r.has_sensitive,
      createdAt: r.created_at,
      profile: r.profile,
    })),
  });
}

const VALID_RELATIONS = ["self", "family", "friend", "partner", "other"] as const;
const VALID_GENDERS = ["male", "female", "other"] as const;

interface ProfileInput {
  displayName: string;
  relationType: (typeof VALID_RELATIONS)[number];
  birthDate: string; // YYYY-MM-DD
  birthTime: string | null; // HH:MM 또는 null
  isLunarInput: boolean;
  isLeapMonth: boolean;
  gender: (typeof VALID_GENDERS)[number];
}

interface ReadingPostBody {
  profile: ProfileInput;
  sajuData: unknown; // SajuResult 직렬화 — 그대로 JSONB 저장
  question: string;
}

function validateProfile(p: unknown): ProfileInput | { error: string } {
  if (!p || typeof p !== "object") return { error: "profile_required" };
  const x = p as Record<string, unknown>;

  if (
    typeof x.displayName !== "string" ||
    x.displayName.length < 1 ||
    x.displayName.length > 50
  )
    return { error: "invalid_display_name" };

  if (
    typeof x.relationType !== "string" ||
    !VALID_RELATIONS.includes(x.relationType as (typeof VALID_RELATIONS)[number])
  )
    return { error: "invalid_relation_type" };

  if (
    typeof x.birthDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(x.birthDate)
  )
    return { error: "invalid_birth_date" };

  if (
    x.birthTime !== null &&
    (typeof x.birthTime !== "string" || !/^\d{2}:\d{2}$/.test(x.birthTime))
  )
    return { error: "invalid_birth_time" };

  if (typeof x.isLunarInput !== "boolean")
    return { error: "invalid_lunar_flag" };
  if (typeof x.isLeapMonth !== "boolean")
    return { error: "invalid_leap_flag" };

  if (
    typeof x.gender !== "string" ||
    !VALID_GENDERS.includes(x.gender as (typeof VALID_GENDERS)[number])
  )
    return { error: "invalid_gender" };

  return {
    displayName: x.displayName,
    relationType: x.relationType as (typeof VALID_RELATIONS)[number],
    birthDate: x.birthDate,
    birthTime: x.birthTime as string | null,
    isLunarInput: x.isLunarInput,
    isLeapMonth: x.isLeapMonth,
    gender: x.gender as (typeof VALID_GENDERS)[number],
  };
}

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json(
      { error: "Login required", code: "LOGIN_REQUIRED" },
      { status: 401 }
    );
  }

  let body: ReadingPostBody;
  try {
    body = (await request.json()) as ReadingPostBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const profileValidated = validateProfile(body.profile);
  if ("error" in profileValidated) {
    return NextResponse.json({ error: profileValidated.error }, { status: 400 });
  }
  const profile = profileValidated;

  if (
    !body.sajuData ||
    typeof body.sajuData !== "object" ||
    Array.isArray(body.sajuData)
  ) {
    return NextResponse.json({ error: "invalid_saju_data" }, { status: 400 });
  }

  if (
    typeof body.question !== "string" ||
    body.question.length < 1 ||
    body.question.length > 500
  ) {
    return NextResponse.json({ error: "invalid_question" }, { status: 400 });
  }

  // 잔액 사전 확인 (UX 빠른 실패)
  const balance = await getStarBalance(userId);
  if (balance < SAJU_READING_COST) {
    return NextResponse.json(
      {
        error: "Insufficient stars",
        code: "INSUFFICIENT_STARS",
        balance,
        required: SAJU_READING_COST,
      },
      { status: 402 }
    );
  }

  const supabase = getServiceSupabase();

  // primary 결정: self 인데 user 의 기존 self primary 없으면 primary=true
  let isPrimary = false;
  if (profile.relationType === "self") {
    const { data: existing } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .maybeSingle();
    if (!existing) isPrimary = true;
  }

  // user_profiles INSERT
  const { data: profileRow, error: pErr } = await supabase
    .from("user_profiles")
    .insert({
      user_id: userId,
      display_name: profile.displayName,
      relation_type: profile.relationType,
      birth_date: profile.birthDate,
      birth_time: profile.birthTime,
      is_lunar_input: profile.isLunarInput,
      is_leap_month: profile.isLeapMonth,
      gender: profile.gender,
      is_primary: isPrimary,
    })
    .select("id")
    .single();

  if (pErr || !profileRow) {
    await logError(pErr ?? new Error("profile insert null"), {
      route: "/api/readings",
      userId,
      extra: { stage: "profile_insert" },
    });
    return NextResponse.json(
      { error: pErr?.message ?? "profile_insert_failed" },
      { status: 500 }
    );
  }

  // readings INSERT
  const { data: reading, error: rErr } = await supabase
    .from("readings")
    .insert({
      user_id: userId,
      profile_id: profileRow.id,
      question: body.question,
      saju_data: body.sajuData,
      stars_spent: SAJU_READING_COST,
      has_sensitive: false,
    })
    .select("id")
    .single();

  if (rErr || !reading) {
    // profile 롤백
    await supabase.from("user_profiles").delete().eq("id", profileRow.id);
    await logError(rErr ?? new Error("reading insert null"), {
      route: "/api/readings",
      userId,
      extra: { stage: "reading_insert" },
    });
    return NextResponse.json(
      { error: rErr?.message ?? "reading_insert_failed" },
      { status: 500 }
    );
  }

  // 별 차감 RPC
  const spend = await spendStars(userId, SAJU_READING_COST, {
    readingId: reading.id,
    source: "saju_reading",
  });
  if (!spend.success) {
    // readings + profile 롤백
    await supabase.from("readings").delete().eq("id", reading.id);
    await supabase.from("user_profiles").delete().eq("id", profileRow.id);
    return NextResponse.json(
      {
        error: "Insufficient stars",
        code: "INSUFFICIENT_STARS",
        reason: spend.reason,
        balance: spend.balance,
        required: SAJU_READING_COST,
      },
      { status: 402 }
    );
  }

  return NextResponse.json({
    id: reading.id,
    success: true,
    cost: SAJU_READING_COST,
    balance: spend.balance,
    transactionId: spend.transactionId,
  });
}
