// 타로 readings INSERT — 타로 풀이 세션 시작 시 호출.
//
// 흐름: 입력 검증 → 잔액 사전 확인 → readings INSERT (consultation_type='tarot')
//      → spendStars(스프레드 비용) → 실패 시 readings 롤백.

import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { spendStars, getStarBalance } from "@/lib/stars";
import { logError } from "@/lib/logger";
import { findRecentDuplicateReading } from "@/lib/reading-dedupe";
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

  // 중복 생성 방어 — 더블클릭·재시도·remount 로 인한 동일 리딩 재생성 차단(별 중복 차감 방지).
  // 이어가기(previousReadingId)는 의도적 새 리딩이므로 스킵.
  if (!body.previousReadingId) {
    const dup = await findRecentDuplicateReading(
      userId,
      {
        consultationType: "tarot",
        emotionTag: body.emotion,
        question: body.concern,
        spreadType: body.spreadType,
        drawnCards,
      },
      "/api/consultations/tarot"
    );
    if (dup) {
      return NextResponse.json({
        id: dup.id,
        success: true,
        cost: dup.starsSpent,
        balance: await getStarBalance(userId),
        duplicate: true,
      });
    }
  }

  const supabase = getServiceSupabase();

  // 이어가기(tarot-fresh) 마커 검증 — 클라가 보낸 previousReadingId 를 신뢰하지 않는다.
  // 부모 소유권 + 비민감 + ended([END]) 를 확인해야 chat 라우트가 부모 요약을 주입할 자격이 됨.
  let continuationPrevId: string | null = null;
  if (typeof body.previousReadingId === "string" && body.previousReadingId) {
    const { data: parent } = await supabase
      .from("readings")
      .select("id, user_id, has_sensitive")
      .eq("id", body.previousReadingId)
      .maybeSingle();
    if (!parent || parent.user_id !== userId || parent.has_sensitive) {
      return NextResponse.json({ error: "invalid_previous_reading" }, { status: 400 });
    }
    const { data: parentMsgs } = await supabase
      .from("messages")
      .select("content")
      .eq("reading_id", parent.id)
      .eq("role", "assistant");
    const ended = (parentMsgs ?? []).some((m) => m.content.includes("[END]"));
    if (!ended) {
      return NextResponse.json({ error: "parent_not_ended" }, { status: 400 });
    }
    continuationPrevId = parent.id;
  }

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
      previous_reading_id: continuationPrevId,
      continuation_mode: continuationPrevId ? "fresh" : null,
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
