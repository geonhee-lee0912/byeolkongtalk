// readings 단건 조회 — result + mypage 가 사용.
// 소유권 검증 + messages 같이 반환.

import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const { data: reading, error } = await supabase
    .from("readings")
    .select(
      "id, user_id, profile_id, question, saju_data, consultation_type, spread_type, spread_category, emotion_tag, drawn_cards, stars_spent, has_sensitive, created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !reading) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (reading.user_id !== userId) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("reading_id", reading.id)
    .order("created_at", { ascending: true });

  const { data: profile } = await supabase
    .from("user_profiles")
    .select(
      "display_name, relation_type, birth_date, birth_time, is_lunar_input, is_leap_month, gender"
    )
    .eq("id", reading.profile_id)
    .maybeSingle();

  return NextResponse.json({
    reading: {
      id: reading.id,
      question: reading.question,
      sajuData: reading.saju_data,
      consultationType: reading.consultation_type,
      spreadType: reading.spread_type,
      spreadCategory: reading.spread_category,
      emotionTag: reading.emotion_tag,
      drawnCards: reading.drawn_cards,
      starsSpent: reading.stars_spent,
      hasSensitive: reading.has_sensitive,
      createdAt: reading.created_at,
    },
    profile,
    messages: messages ?? [],
  });
}
