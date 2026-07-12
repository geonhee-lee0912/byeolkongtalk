// readings 공개 조회 — 공유 링크를 받은 비로그인/비소유자가 result 를 볼 수 있게.
// 인증/소유권 검증 없음. 단 민감(has_sensitive) 대화는 공개 차단. 프로필 PII 미반환.

import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = getServiceSupabase();
  const { data: reading, error } = await supabase
    .from("readings")
    .select(
      "id, question, consultation_type, spread_type, spread_category, emotion_tag, drawn_cards, stars_spent, has_sensitive, created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !reading) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // 민감 대화는 공개 조회 차단 (공유 버튼도 숨겨져 있어 일관됨)
  if (reading.has_sensitive) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("reading_id", reading.id)
    .order("created_at", { ascending: true })
    .order("role", { ascending: false });

  return NextResponse.json({
    reading: {
      id: reading.id,
      question: reading.question,
      sajuData: null,
      consultationType: reading.consultation_type,
      spreadType: reading.spread_type,
      spreadCategory: reading.spread_category,
      emotionTag: reading.emotion_tag,
      drawnCards: reading.drawn_cards,
      starsSpent: reading.stars_spent,
      hasSensitive: reading.has_sensitive,
      createdAt: reading.created_at,
    },
    messages: messages ?? [],
    public: true,
  });
}
