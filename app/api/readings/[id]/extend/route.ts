// 대화 연장(extend) 구매 — extra_turns += EXTEND_TURNS + 별 차감.
// 검증: 세션 → 소유권 → has_sensitive false → ended 아님 → 한도 → 차감 → DB 업데이트.

import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { spendStars } from "@/lib/stars";
import { logError } from "@/lib/logger";
import { EXTEND_COST, EXTEND_TURNS, EXTEND_MAX } from "@/lib/upsell";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  const supabase = getServiceSupabase();

  const { data: reading, error: rErr } = await supabase
    .from("readings")
    .select("id, user_id, has_sensitive, extra_turns")
    .eq("id", id)
    .maybeSingle();

  if (rErr || !reading) {
    return NextResponse.json({ error: "reading_not_found" }, { status: 404 });
  }
  if (reading.user_id !== userId) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }
  if (reading.has_sensitive) {
    return NextResponse.json({ error: "sensitive_blocked" }, { status: 403 });
  }

  // ended 검증 — assistant 메시지에 [END] 존재하면 400
  const { data: msgRows } = await supabase
    .from("messages")
    .select("content")
    .eq("reading_id", id)
    .eq("role", "assistant");
  const ended = (msgRows ?? []).some((m) => m.content.includes("[END]"));
  if (ended) {
    return NextResponse.json({ error: "reading_already_ended" }, { status: 400 });
  }

  // 한도 검증 — extra_turns < EXTEND_TURNS * EXTEND_MAX (= 4), 즉 0일 때만
  const extraTurns = (reading.extra_turns as number) ?? 0;
  if (extraTurns >= EXTEND_TURNS * EXTEND_MAX) {
    return NextResponse.json(
      { error: "extend_limit_reached", max: EXTEND_MAX },
      { status: 400 }
    );
  }

  // 별 차감
  const spend = await spendStars(userId, EXTEND_COST, {
    readingId: id,
    source: "extend",
  });
  if (!spend.success) {
    return NextResponse.json(
      { error: "insufficient", balance: spend.balance },
      { status: 402 }
    );
  }

  // extra_turns 업데이트
  const newExtraTurns = extraTurns + EXTEND_TURNS;
  const { error: updateErr } = await supabase
    .from("readings")
    .update({ extra_turns: newExtraTurns })
    .eq("id", id);

  if (updateErr) {
    // 차감 성공 후 업데이트 실패 — 수동 보정 필요
    console.error(
      "[extend] extra_turns UPDATE 실패 — 수동 보정 필요:",
      { readingId: id, userId, newExtraTurns, updateErr }
    );
    await logError(updateErr, {
      route: `/api/readings/${id}/extend`,
      userId,
      extra: { stage: "update_extra_turns", readingId: id },
    });
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ extraTurns: newExtraTurns });
}
