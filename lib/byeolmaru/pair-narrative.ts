// lib/byeolmaru/pair-narrative.ts — 유료 "우리 오늘" 서술 캐시((유저,상대,날짜)별 1회 생성).
// daily-report.ts 와 같은 모양·같은 규율(23505 무시 = 동시 생성 시 먼저 쓴 쪽을 남긴다).
import { getServiceSupabase } from "@/lib/supabase";
import { logWarn } from "@/lib/logger";

/** 캐시된 서술 조회. 없으면 null. */
export async function getCachedPairNarrative(
  userId: string,
  partnerProfileId: string,
  dateStr: string
): Promise<string | null> {
  const { data, error } = await getServiceSupabase()
    .from("byeolmaru_pair_narrative")
    .select("narrative")
    .eq("user_id", userId)
    .eq("partner_profile_id", partnerProfileId)
    .eq("narrative_date", dateStr)
    .maybeSingle();
  if (error) {
    // §11-1-7 — DB 장애로 캐시가 0% 적중해도 어디에도 안 찍히던 것. "없음"과 구분한다.
    void logWarn("pair narrative cache read failed", {
      route: "lib/byeolmaru/pair-narrative",
      userId,
      extra: { dateStr, partnerProfileId, code: (error as { code?: string }).code, message: error.message },
    });
    return null;
  }
  if (!data) return null;
  return data.narrative as string;
}

/** 서술 저장. 반환값이 응답에 써야 할 것 — 동시 생성(23505)으로 졌으면 승자 서술(§11-1-5). */
export async function savePairNarrative(
  userId: string,
  partnerProfileId: string,
  dateStr: string,
  narrative: string
): Promise<string> {
  const { error } = await getServiceSupabase()
    .from("byeolmaru_pair_narrative")
    .insert({ user_id: userId, partner_profile_id: partnerProfileId, narrative_date: dateStr, narrative });
  if (!error) return narrative;
  if ((error as { code?: string }).code === "23505") {
    const winner = await getCachedPairNarrative(userId, partnerProfileId, dateStr);
    return winner ?? narrative;
  }
  throw error;
}
