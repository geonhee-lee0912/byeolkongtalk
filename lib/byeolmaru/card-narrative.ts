// lib/byeolmaru/card-narrative.ts — 유료 "오늘 타로" 해석 캐시((유저,날짜)별 1회 생성).
// pair-narrative.ts 와 같은 모양·같은 규율(23505 무시 = 동시 생성 시 먼저 쓴 쪽을 남긴다).
import { getServiceSupabase } from "@/lib/supabase";

/** 캐시된 해석 조회. 없으면 null. */
export async function getCachedCardNarrative(userId: string, dateStr: string): Promise<string | null> {
  const { data, error } = await getServiceSupabase()
    .from("byeolmaru_card_narrative")
    .select("narrative")
    .eq("user_id", userId)
    .eq("narrative_date", dateStr)
    .maybeSingle();
  if (error || !data) return null;
  return data.narrative as string;
}

/** 해석 저장. 이미 있으면(동시 생성) 덮지 않는다(23505 무시). */
export async function saveCardNarrative(userId: string, dateStr: string, narrative: string): Promise<void> {
  const { error } = await getServiceSupabase()
    .from("byeolmaru_card_narrative")
    .insert({ user_id: userId, narrative_date: dateStr, narrative });
  if (error && (error as { code?: string }).code !== "23505") {
    throw error;
  }
}
