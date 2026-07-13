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

  const extraTurns = (reading.extra_turns as number) ?? 0;

  // 슬롯 원자 선점 — extra_turns < EXTEND_TURNS * EXTEND_MAX 조건부 +EXTEND_TURNS.
  // 반환 0행 → 이미 한도 소진 (동시 요청 포함), 차감 없이 400.
  const { data: slotRows, error: slotErr } = await supabase
    .from("readings")
    .update({ extra_turns: extraTurns + EXTEND_TURNS })
    .eq("id", id)
    .eq("user_id", userId)
    .lt("extra_turns", EXTEND_TURNS * EXTEND_MAX)
    .select("extra_turns");

  if (slotErr) {
    await logError(slotErr, {
      route: `/api/readings/${id}/extend`,
      userId,
      extra: { stage: "slot_atomic", readingId: id },
    });
    return NextResponse.json({ error: "slot_error" }, { status: 500 });
  }
  if (!slotRows || slotRows.length === 0) {
    return NextResponse.json(
      { error: "extend_limit_reached", max: EXTEND_MAX },
      { status: 400 }
    );
  }

  const newExtraTurns = slotRows[0].extra_turns as number;

  // 별 차감
  const spend = await spendStars(userId, EXTEND_COST, {
    readingId: id,
    source: "extend",
  });
  if (!spend.success) {
    // 선점 반납
    const { error: rollbackErr } = await supabase
      .from("readings")
      .update({ extra_turns: newExtraTurns - EXTEND_TURNS })
      .eq("id", id);
    if (rollbackErr) {
      console.error("[extend] 선점 반납 실패 — 수동 보정 필요:", { readingId: id, userId });
      await logError(rollbackErr, {
        route: `/api/readings/${id}/extend`,
        userId,
        extra: { stage: "slot_rollback", readingId: id },
      });
    }
    return NextResponse.json(
      { error: "insufficient", balance: spend.balance },
      { status: 402 }
    );
  }

  return NextResponse.json({ extraTurns: newExtraTurns });
}
