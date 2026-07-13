// 보조 카드(clarifier) 구매 — 타로 리딩 중 카드 1장 추가 + 별 차감.
// 검증: 세션 → 소유권 → tarot 타입 → ended 아님 → 한도 → 카드 중복 → 차감 → DB 업데이트.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { spendStars } from "@/lib/stars";
import { logError } from "@/lib/logger";
import { CLARIFIER_COST, CLARIFIER_MAX } from "@/lib/upsell";
import type { DrawnCard } from "@/lib/tarot/spreads";

export const dynamic = "force-dynamic";

interface ClarifierBody {
  readingId: string;
  card: {
    card_id: number;
    direction: "upright" | "reversed";
  };
}

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  let body: ClarifierBody;
  try {
    body = (await request.json()) as ClarifierBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.readingId !== "string" || !body.readingId) {
    return NextResponse.json({ error: "readingId_required" }, { status: 400 });
  }
  if (
    !body.card ||
    typeof body.card.card_id !== "number" ||
    body.card.card_id < 0 ||
    body.card.card_id > 77 ||
    !Number.isInteger(body.card.card_id) ||
    (body.card.direction !== "upright" && body.card.direction !== "reversed")
  ) {
    return NextResponse.json({ error: "invalid_card" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  const { data: reading, error: rErr } = await supabase
    .from("readings")
    .select(
      "id, user_id, consultation_type, drawn_cards, clarifier_count, has_sensitive"
    )
    .eq("id", body.readingId)
    .maybeSingle();

  if (rErr || !reading) {
    return NextResponse.json({ error: "reading_not_found" }, { status: 404 });
  }
  if (reading.user_id !== userId) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }
  if (reading.consultation_type !== "tarot") {
    return NextResponse.json({ error: "not_a_tarot_reading" }, { status: 400 });
  }
  if (reading.has_sensitive) {
    return NextResponse.json({ error: "sensitive_blocked" }, { status: 403 });
  }

  // ended 검증 — assistant 메시지에 [END] 존재하면 400
  const { data: msgRows } = await supabase
    .from("messages")
    .select("content")
    .eq("reading_id", reading.id)
    .eq("role", "assistant");
  const ended = (msgRows ?? []).some((m) => m.content.includes("[END]"));
  if (ended) {
    return NextResponse.json({ error: "reading_already_ended" }, { status: 400 });
  }

  // 카드 중복 검증 — 기존 drawn_cards에 동일 card_id 없어야 함
  const drawnCards = ((reading.drawn_cards as DrawnCard[]) ?? []);
  if (drawnCards.some((c) => c.card_id === body.card.card_id)) {
    return NextResponse.json({ error: "card_already_drawn" }, { status: 400 });
  }

  // 슬롯 원자 선점 — clarifier_count < CLARIFIER_MAX 조건부 +1.
  // 반환 0행 → 이미 한도 소진 (동시 요청 포함), 차감 없이 400.
  const { data: slotRows, error: slotErr } = await supabase
    .from("readings")
    .update({ clarifier_count: reading.clarifier_count + 1 })
    .eq("id", reading.id)
    .eq("user_id", userId)
    .lt("clarifier_count", CLARIFIER_MAX)
    .select("clarifier_count");

  if (slotErr) {
    await logError(slotErr, {
      route: "/api/consultations/tarot/clarifier",
      userId,
      extra: { stage: "slot_atomic", readingId: reading.id },
    });
    return NextResponse.json({ error: "slot_error" }, { status: 500 });
  }
  if (!slotRows || slotRows.length === 0) {
    return NextResponse.json(
      { error: "clarifier_limit_reached", max: CLARIFIER_MAX },
      { status: 400 }
    );
  }

  const newClarifierCount = slotRows[0].clarifier_count as number;

  // 별 차감
  const spend = await spendStars(userId, CLARIFIER_COST, {
    readingId: reading.id,
    source: "clarifier",
  });
  if (!spend.success) {
    // 선점 반납
    const { error: rollbackErr } = await supabase
      .from("readings")
      .update({ clarifier_count: newClarifierCount - 1 })
      .eq("id", reading.id);
    if (rollbackErr) {
      console.error("[clarifier] 선점 반납 실패 — 수동 보정 필요:", { readingId: reading.id, userId });
      await logError(rollbackErr, {
        route: "/api/consultations/tarot/clarifier",
        userId,
        extra: { stage: "slot_rollback", readingId: reading.id },
      });
    }
    return NextResponse.json(
      { error: "insufficient", balance: spend.balance },
      { status: 402 }
    );
  }

  // drawn_cards 업데이트
  const newCard: DrawnCard = {
    position: drawnCards.length,
    label: "보조 카드",
    card_id: body.card.card_id,
    direction: body.card.direction,
  };
  const updatedCards = [...drawnCards, newCard];

  const { error: updateErr } = await supabase
    .from("readings")
    .update({ drawn_cards: updatedCards })
    .eq("id", reading.id);

  if (updateErr) {
    // 차감·선점 성공 후 drawn_cards 업데이트 실패 — 수동 보정 필요
    console.error(
      "[clarifier] drawn_cards UPDATE 실패 — 수동 보정 필요:",
      { readingId: reading.id, userId, newCard, updateErr }
    );
    await logError(updateErr, {
      route: "/api/consultations/tarot/clarifier",
      userId,
      extra: { stage: "update_drawn_cards", readingId: reading.id },
    });
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({
    drawnCards: updatedCards,
    clarifierCount: newClarifierCount,
  });
}
