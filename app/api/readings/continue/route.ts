// 이어가기 — 서버 복사 생성. saju-fresh/saju-deep/tarot-deep 처리.
// (tarot-fresh 는 새 카드 추첨이 필요해 /api/consultations/tarot 로 감)
//
// 흐름: 세션 → 부모 소유권 + ended 검증 → 부모 필드 복사 → 가격 계산(타로 부모는 화면이 본 가격 대조, 어긋나면 409)
//       → readings INSERT(previous_reading_id+continuation_mode) → spendStars → 실패 시 롤백.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { spendStars, getStarBalance } from "@/lib/stars";
import { logError } from "@/lib/logger";
import { continuationPrice, fullCostFor, type ContinuationMode } from "@/lib/continuation";
import { PROMPT_VERSION } from "@/lib/prompt-version";
import type { SpreadType } from "@/lib/tarot/spreads";
import { menuArmOf } from "@/lib/tarot/menu-ab";
import { checkShownPrice } from "@/lib/tarot/pricing";

export const dynamic = "force-dynamic";

interface ContinueBody {
  previousReadingId: string;
  mode: ContinuationMode;
  concern: string;
  /** 이어가기 팝업이 이 버튼에 보여 준 가격. 옛 번들은 안 보낸다. 타로 부모만 대조한다(checkShownPrice — 0 이상 정수만 값) */
  expectedCost?: number;
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
    arm: menuArmOf(userId),
  });
  const cost = continuationPrice(fullCost, body.mode);

  // 화면이 본 가격 대조(타로 부모만) — 잔액 확인·리딩 생성·차감보다 먼저. 배포 순간 낡은 이어가기 팝업은 옛 그룹 가격을 보여 주고
  // expectedCost 를 안 보낸다 → 옛 화면 값 = 같은 계산(fullCostFor → continuationPrice)을 옛 그룹으로 — 반올림까지 서버 가격과 같은 길.
  // 사주 부모는 대조하지 않는다 — 사주 이어가기 가격은 그룹과 무관하고 이번 배포에서 오르지 않았다(옛 화면이 덜 보여 주는 일이 없다)
  if (consultationType === "tarot") {
    const legacyShown = continuationPrice(
      fullCostFor({ consultationType, spreadType: parent.spread_type as SpreadType | null, arm: "legacy" }),
      body.mode
    );
    if (checkShownPrice({ expected: body.expectedCost, actual: cost, legacyShown }) === "changed") {
      return NextResponse.json({ error: "price_changed", cost }, { status: 409 });
    }
  }

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
      prompt_version: PROMPT_VERSION,
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
