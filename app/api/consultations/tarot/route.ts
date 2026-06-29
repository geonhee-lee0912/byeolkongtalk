// 타로 readings INSERT — 타로 풀이 세션 시작 시 호출.
//
// 흐름: 입력 검증 → 잔액 사전 확인 → readings INSERT (consultation_type='tarot')
//      → spendStars(스프레드 비용) → 실패 시 readings 롤백.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { spendStars, getStarBalance } from "@/lib/stars";
import { logError } from "@/lib/logger";
import {
  SPREAD_INFO,
  type SpreadType,
  type SpreadCategory,
  type DrawnCard,
} from "@/lib/tarot/spreads";
import { EMOTION_OPTIONS, type EmotionTag } from "@/lib/emotions";

export const dynamic = "force-dynamic";

const VALID_SPREADS = Object.keys(SPREAD_INFO) as SpreadType[];
const VALID_CATEGORIES: SpreadCategory[] = [
  "love",
  "interpersonal",
  "career",
  "decision",
  "mental",
  "worry",
  "default",
];
const VALID_EMOTIONS = EMOTION_OPTIONS.map((o) => o.tag);

interface TarotPostBody {
  spreadType: SpreadType;
  spreadCategory: SpreadCategory;
  emotion: EmotionTag;
  concern: string;
  drawnCards: DrawnCard[];
  previousReadingId?: string;
  continuationMode?: "fresh" | "deep";
}

function validateDrawnCards(
  cards: unknown,
  expectedCount: number
): DrawnCard[] | { error: string } {
  if (!Array.isArray(cards) || cards.length !== expectedCount) {
    return { error: "invalid_drawn_cards_count" };
  }
  const out: DrawnCard[] = [];
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i] as Record<string, unknown>;
    if (!c || typeof c !== "object") return { error: "invalid_drawn_card" };
    if (
      typeof c.card_id !== "number" ||
      !Number.isInteger(c.card_id) ||
      c.card_id < 0 ||
      c.card_id > 77
    )
      return { error: "invalid_card_id" };
    if (c.direction !== "upright" && c.direction !== "reversed")
      return { error: "invalid_direction" };
    if (typeof c.position !== "number" || !Number.isInteger(c.position))
      return { error: "invalid_position" };
    if (typeof c.label !== "string" || c.label.length > 30)
      return { error: "invalid_label" };
    out.push({
      position: c.position,
      label: c.label,
      card_id: c.card_id,
      direction: c.direction,
    });
  }
  return out;
}

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json(
      { error: "Login required", code: "LOGIN_REQUIRED" },
      { status: 401 }
    );
  }

  let body: TarotPostBody;
  try {
    body = (await request.json()) as TarotPostBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!VALID_SPREADS.includes(body.spreadType)) {
    return NextResponse.json({ error: "invalid_spread_type" }, { status: 400 });
  }
  if (!VALID_CATEGORIES.includes(body.spreadCategory)) {
    return NextResponse.json({ error: "invalid_spread_category" }, { status: 400 });
  }
  if (!VALID_EMOTIONS.includes(body.emotion)) {
    return NextResponse.json({ error: "invalid_emotion" }, { status: 400 });
  }
  if (
    typeof body.concern !== "string" ||
    body.concern.length < 1 ||
    body.concern.length > 500
  ) {
    return NextResponse.json({ error: "invalid_concern" }, { status: 400 });
  }

  const info = SPREAD_INFO[body.spreadType];
  const drawnValidated = validateDrawnCards(body.drawnCards, info.cardCount);
  if ("error" in drawnValidated) {
    return NextResponse.json({ error: drawnValidated.error }, { status: 400 });
  }
  const drawnCards = drawnValidated;
  const cost = info.starCost;

  // 잔액 사전 확인 (UX 빠른 실패)
  const balance = await getStarBalance(userId);
  if (balance < cost) {
    return NextResponse.json(
      {
        error: "Insufficient stars",
        code: "INSUFFICIENT_STARS",
        balance,
        required: cost,
      },
      { status: 402 }
    );
  }

  const supabase = getServiceSupabase();

  const { data: reading, error: rErr } = await supabase
    .from("readings")
    .insert({
      user_id: userId,
      profile_id: null,
      question: body.concern,
      saju_data: null,
      consultation_type: "tarot",
      spread_type: body.spreadType,
      spread_category: body.spreadCategory,
      emotion_tag: body.emotion,
      drawn_cards: drawnCards,
      stars_spent: cost,
      has_sensitive: false,
      previous_reading_id:
        typeof body.previousReadingId === "string" && body.previousReadingId
          ? body.previousReadingId
          : null,
      continuation_mode: body.continuationMode === "fresh" ? "fresh" : null,
    })
    .select("id")
    .single();

  if (rErr || !reading) {
    await logError(rErr ?? new Error("tarot reading insert null"), {
      route: "/api/consultations/tarot",
      userId,
      extra: { stage: "reading_insert" },
    });
    return NextResponse.json(
      { error: rErr?.message ?? "reading_insert_failed" },
      { status: 500 }
    );
  }

  const spend = await spendStars(userId, cost, {
    readingId: reading.id,
    source: "tarot_reading",
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
    success: true,
    cost,
    balance: spend.balance,
    transactionId: spend.transactionId,
  });
}
