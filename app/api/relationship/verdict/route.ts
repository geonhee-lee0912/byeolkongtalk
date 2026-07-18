// app/api/relationship/verdict/route.ts — 싸움 잘잘못 판정(dialogue) 세션 생성
// 흐름: 관계 소유권 + 활성 패스 확인 → 잔액 사전 확인 → readings INSERT(consultation_type='relationship')
//      → spendStars(30) → 실패 시 readings 롤백.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { spendStars, getStarBalance } from "@/lib/stars";
import { getSkill } from "@/lib/relationship/skills";
import { getActivePass } from "@/lib/relationship/passes";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

interface VerdictPostBody {
  relationshipId?: string;
}

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json(
      { error: "Login required", code: "LOGIN_REQUIRED" },
      { status: 401 }
    );
  }

  let body: VerdictPostBody;
  try {
    body = (await request.json()) as VerdictPostBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.relationshipId !== "string" || !body.relationshipId) {
    return NextResponse.json({ error: "relationshipId_required" }, { status: 400 });
  }

  const skill = getSkill("verdict");
  if (!skill) {
    return NextResponse.json({ error: "skill_not_found" }, { status: 500 });
  }

  const supabase = getServiceSupabase();

  // 관계 소유권 확인
  const { data: rel } = await supabase
    .from("relationships")
    .select("id, user_id")
    .eq("id", body.relationshipId)
    .maybeSingle();
  if (!rel || rel.user_id !== userId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // 활성 패스 게이트 (스펙 §6)
  if (!(await getActivePass(rel.id))) {
    return NextResponse.json({ error: "pass_required" }, { status: 402 });
  }

  // 잔액 사전 확인 (UX 빠른 실패)
  const balance = await getStarBalance(userId);
  if (balance < skill.starCost) {
    return NextResponse.json(
      {
        error: "Insufficient stars",
        code: "INSUFFICIENT_STARS",
        balance,
        required: skill.starCost,
      },
      { status: 402 }
    );
  }

  const { data: reading, error: rErr } = await supabase
    .from("readings")
    .insert({
      user_id: userId,
      consultation_type: "relationship",
      relationship_id: rel.id,
      skill_key: "verdict",
      profile_id: null,
      saju_data: null,
      stars_spent: skill.starCost,
      has_sensitive: false,
    })
    .select("id")
    .single();

  if (rErr || !reading) {
    await logError(rErr ?? new Error("verdict reading insert null"), {
      route: "/api/relationship/verdict",
      userId,
      extra: { stage: "reading_insert" },
    });
    return NextResponse.json(
      { error: rErr?.message ?? "reading_insert_failed" },
      { status: 500 }
    );
  }

  const spend = await spendStars(userId, skill.starCost, {
    readingId: reading.id,
    source: "rel_skill_verdict",
  });
  if (!spend.success) {
    await supabase.from("readings").delete().eq("id", reading.id);
    return NextResponse.json(
      {
        error: "Insufficient stars",
        code: "INSUFFICIENT_STARS",
        reason: spend.reason,
        balance: spend.balance,
        required: skill.starCost,
      },
      { status: 402 }
    );
  }

  return NextResponse.json({ id: reading.id, success: true, balance: spend.balance });
}
