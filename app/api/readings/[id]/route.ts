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
      "id, user_id, profile_id, question, saju_data, consultation_type, spread_type, spread_category, emotion_tag, drawn_cards, stars_spent, has_sensitive, next_reco, created_at, relationship_id"
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
    .order("created_at", { ascending: true })
    .order("role", { ascending: false });

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
      nextReco: reading.next_reco ?? null,
      createdAt: reading.created_at,
      relationshipId: reading.relationship_id ?? null,
    },
    profile,
    messages: messages ?? [],
  });
}

// 결과 화면 열람 마킹 — 소유자가 result 페이지를 처음 열 때 1회. 완료 퍼널의 "결과 열람" 단계.
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
  const { data: reading } = await supabase
    .from("readings")
    .select("id, user_id, result_viewed_at")
    .eq("id", id)
    .maybeSingle();
  if (!reading) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (reading.user_id !== userId) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }
  // 최초 열람만 기록 (첫 열람 시점 보존, 재방문으로 덮어쓰지 않음)
  if (!reading.result_viewed_at) {
    await supabase
      .from("readings")
      .update({ result_viewed_at: new Date().toISOString() })
      .eq("id", id);
  }
  return NextResponse.json({ ok: true });
}

// 고민톡 단건 삭제 — 소유권 검증 후 messages 먼저, 그다음 reading 삭제.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required" }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const { data: reading } = await supabase
    .from("readings")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (!reading) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (reading.user_id !== userId) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  await supabase.from("messages").delete().eq("reading_id", id);
  const { error } = await supabase.from("readings").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
