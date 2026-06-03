// 본인 사주 프로필 정본 CRUD (목록/생성). 표시용 사주는 서버 calcSaju 재계산.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { calcSaju } from "@/lib/saju/calc";
import {
  validateProfile,
  profileRowToSajuInput,
} from "@/lib/saju/profile-input";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ProfileRow {
  id: string;
  display_name: string;
  relation_type: string;
  birth_date: string;
  birth_time: string | null;
  is_lunar_input: boolean;
  is_leap_month: boolean;
  gender: string;
  is_primary: boolean;
  created_at: string;
}

function serializeProfile(row: ProfileRow) {
  const saju = calcSaju(profileRowToSajuInput(row));
  return {
    id: row.id,
    displayName: row.display_name,
    relationType: row.relation_type,
    birthDate: row.birth_date,
    birthTime: row.birth_time,
    isLunarInput: row.is_lunar_input,
    isLeapMonth: row.is_leap_month,
    gender: row.gender,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
    saju,
  };
}

// GET /api/profiles — 본인 프로필 목록 (self/primary 먼저, 그다음 지인 created_at)
export async function GET() {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ profiles: [] });
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("user_profiles")
    .select(
      "id, display_name, relation_type, birth_date, birth_time, is_lunar_input, is_leap_month, gender, is_primary, created_at"
    )
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ profiles: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    profiles: (data ?? []).map((r) => serializeProfile(r as ProfileRow)),
  });
}

// POST /api/profiles — 프로필 생성 (계정 사주 또는 지인)
export async function POST(req: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json(
      { error: "Login required", code: "LOGIN_REQUIRED" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const validated = validateProfile(body);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const p = validated;

  const supabase = getServiceSupabase();
  const isPrimary = p.relationType === "self";

  // self 생성 시 기존 self/primary가 있으면 409 (UI는 PATCH로 분기 — partial unique index 위반 방어)
  if (isPrimary) {
    const { data: existing } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "primary_exists", code: "PRIMARY_EXISTS" },
        { status: 409 }
      );
    }
  }

  const { data: row, error } = await supabase
    .from("user_profiles")
    .insert({
      user_id: userId,
      display_name: p.displayName,
      relation_type: p.relationType,
      birth_date: p.birthDate,
      birth_time: p.birthTime,
      is_lunar_input: p.isLunarInput,
      is_leap_month: p.isLeapMonth,
      gender: p.gender,
      is_primary: isPrimary,
    })
    .select(
      "id, display_name, relation_type, birth_date, birth_time, is_lunar_input, is_leap_month, gender, is_primary, created_at"
    )
    .single();

  if (error || !row) {
    await logError(error ?? new Error("profile insert null"), {
      route: "/api/profiles",
      userId,
      extra: { stage: "insert" },
    });
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile: serializeProfile(row as ProfileRow) });
}
