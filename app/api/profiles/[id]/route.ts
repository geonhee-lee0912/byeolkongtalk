// 본인 사주 프로필 수정/삭제 (소유권 확인). 삭제 시 readings는 FK SET NULL로 보존.

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

// PATCH /api/profiles/[id] — 수정 (소유권 확인)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  // 소유권 확인 (+ self 행의 relation_type/is_primary 불변 유지)
  const { data: owned } = await supabase
    .from("user_profiles")
    .select("id, is_primary, relation_type")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!owned) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // self/primary 행은 relation_type을 self로 고정 (지인으로 강등 방지)
  const relationType = owned.is_primary ? "self" : p.relationType;

  const { data: row, error } = await supabase
    .from("user_profiles")
    .update({
      display_name: p.displayName,
      relation_type: relationType,
      birth_date: p.birthDate,
      birth_time: p.birthTime,
      is_lunar_input: p.isLunarInput,
      is_leap_month: p.isLeapMonth,
      gender: p.gender,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select(
      "id, display_name, relation_type, birth_date, birth_time, is_lunar_input, is_leap_month, gender, is_primary, created_at"
    )
    .single();

  if (error || !row) {
    await logError(error ?? new Error("profile update null"), {
      route: "/api/profiles/[id]",
      userId,
      extra: { stage: "update", id },
    });
    return NextResponse.json(
      { error: error?.message ?? "update_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile: serializeProfile(row as ProfileRow) });
}

// DELETE /api/profiles/[id] — 삭제 (소유권 확인). readings는 SET NULL 보존.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json(
      { error: "Login required", code: "LOGIN_REQUIRED" },
      { status: 401 }
    );
  }

  const supabase = getServiceSupabase();

  const { data: owned } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!owned) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("user_profiles")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    await logError(error, {
      route: "/api/profiles/[id]",
      userId,
      extra: { stage: "delete", id },
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
