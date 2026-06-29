// 이어가기 — 서버 복사 생성. saju-fresh/saju-deep/tarot-deep 처리.
// (tarot-fresh 는 새 카드 추첨이 필요해 /api/consultations/tarot 로 감)
//
// 흐름: 세션 → 부모 소유권 + ended 검증 → 부모 필드 복사 → 가격 계산
//       → readings INSERT(previous_reading_id+continuation_mode) → spendStars → 실패 시 롤백.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { spendStars, getStarBalance } from "@/lib/stars";
import { logError } from "@/lib/logger";
import { continuationPrice, fullCostFor, type ContinuationMode } from "@/lib/continuation";
import type { SpreadType } from "@/lib/tarot/spreads";

export const dynamic = "force-dynamic";

interface ContinueBody {
  previousReadingId: string;
  mode: ContinuationMode;
  concern: string;
}

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json(
      { error: "Login required", code: "LOGIN_REQUIRED" },
      { status: 401 }
    );
  }

  let body: ContinueBody;
  try {
    body = (await request.json()) as ContinueBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.previousReadingId !== "string" || !body.previousReadingId) {
    return NextResponse.json({ error: "previous_reading_id_required" }, { status: 400 });
  }
  if (body.mode !== "fresh" && body.mode !== "deep") {
    return NextResponse.json({ error: "invalid_mode" }, { status: 400 });
  }
  if (typeof body.concern !== "string" || body.concern.length < 1 || body.concern.length > 500) {
    return NextResponse.json({ error: "invalid_concern" }, { status: 400 });
  }

  const supabase = getServiceSupabase();

  // 부모 조회 + 소유권
  const { data: parent, error: pErr } = await supabase
    .from("readings")
    .select(
      "id, user_id, profile_id, saju_data, consultation_type, spread_type, spread_category, saju_product, emotion_tag, drawn_cards, has_sensitive"
    )
    .eq("id", body.previousReadingId)
    .maybeSingle();

  if (pErr || !parent) {
    return NextResponse.json({ error: "parent_not_found" }, { status: 404 });
  }
  if (parent.user_id !== userId) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }
  if (parent.has_sensitive) {
    return NextResponse.json({ error: "sensitive_blocked" }, { status: 403 });
  }

  // tarot-fresh 는 새 카드가 필요하므로 이 라우트가 아님
  const consultationType = (parent.consultation_type as "saju" | "tarot") ?? "saju";
  if (consultationType === "tarot" && body.mode === "fresh") {
    return NextResponse.json({ error: "tarot_fresh_uses_draw_flow" }, { status: 400 });
  }

  // 부모가 마무리됐는지(ended) 검증 — assistant 메시지에 [END] 존재
  const { data: msgRows } = await supabase
    .from("messages")
    .select("content")
    .eq("reading_id", parent.id)
    .eq("role", "assistant");
  const ended = (msgRows ?? []).some((m) => m.content.includes("[END]"));
  if (!ended) {
    return NextResponse.json({ error: "parent_not_ended" }, { status: 400 });
  }

  // 가격: 상품 정가 기준
  const fullCost = fullCostFor({
    consultationType,
    spreadType: parent.spread_type as SpreadType | null,
  });
  const cost = continuationPrice(fullCost, body.mode);

  // 잔액 사전 확인
  const balance = await getStarBalance(userId);
  if (balance < cost) {
    return NextResponse.json(
      { error: "Insufficient stars", code: "INSUFFICIENT_STARS", balance, required: cost },
      { status: 402 }
    );
  }

  // 부모 필드 복사 + 새 고민 + 연속성 링크
  const { data: reading, error: rErr } = await supabase
    .from("readings")
    .insert({
      user_id: userId,
      profile_id: parent.profile_id,
      question: body.concern,
      saju_data: parent.saju_data,
      consultation_type: consultationType,
      spread_type: parent.spread_type,
      spread_category: parent.spread_category,
      saju_product: parent.saju_product,
      emotion_tag: parent.emotion_tag,
      drawn_cards: parent.drawn_cards,
      stars_spent: cost,
      has_sensitive: false,
      previous_reading_id: parent.id,
      continuation_mode: body.mode,
    })
    .select("id")
    .single();

  if (rErr || !reading) {
    await logError(rErr ?? new Error("continue reading insert null"), {
      route: "/api/readings/continue",
      userId,
      extra: { stage: "reading_insert", previousReadingId: parent.id },
    });
    return NextResponse.json(
      { error: rErr?.message ?? "reading_insert_failed" },
      { status: 500 }
    );
  }

  const spend = await spendStars(userId, cost, {
    readingId: reading.id,
    source: consultationType === "tarot" ? "tarot_reading" : "saju_reading",
  });
  if (!spend.success) {
    await supabase.from("readings").delete().eq("id", reading.id);
    return NextResponse.json(
      {
        error: "Insufficient stars",
        code: "INSUFFICIENT_STARS",
        reason: spend.reason,
        balance: spend.balance,
        required: cost,
      },
      { status: 402 }
    );
  }

  return NextResponse.json({
    id: reading.id,
    consultationType,
    success: true,
    cost,
    balance: spend.balance,
  });
}
