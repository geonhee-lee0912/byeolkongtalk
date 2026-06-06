// 이번 달(한국시간) 이미 본 monthly 리딩을 프로필별로 찾기 — 같은 달 재선택 시 '다시보기' 안내용.

import { getServiceSupabase } from "@/lib/supabase";
import { FORTUNE_CONFIG } from "@/lib/fortune/types";

/** KST(UTC+9) 기준 이번 달 1일 0시 ~ 다음 달 1일 0시 구간을 UTC ISO 문자열로. */
export function kstMonthWindowUtc(now: Date = new Date()): { start: string; end: string } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth(); // 0-11
  // Date.UTC 는 month 13(=다음 해 1월)을 자동 정규화하므로 연말 경계 안전.
  const startUtcMs = Date.UTC(y, m, 1) - 9 * 60 * 60 * 1000;
  const endUtcMs = Date.UTC(y, m + 1, 1) - 9 * 60 * 60 * 1000;
  return {
    start: new Date(startUtcMs).toISOString(),
    end: new Date(endUtcMs).toISOString(),
  };
}

/**
 * 이 유저가 이번 달(KST) 만든 monthly 리딩을 profile_id 별 최신 1건으로 그룹핑한 맵.
 * profile_id 가 null 인 legacy/직접입력 행은 제외.
 */
export async function findThisMonthMonthlyByProfile(
  userId: string
): Promise<Record<string, string>> {
  const { start, end } = kstMonthWindowUtc();
  const { data } = await getServiceSupabase()
    .from("readings")
    .select("id, profile_id, created_at")
    .eq("user_id", userId)
    .eq("emotion_tag", FORTUNE_CONFIG.monthly.emotionTag)
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending: false });

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    const r = row as { id: string; profile_id: string | null };
    if (r.profile_id && !map[r.profile_id]) map[r.profile_id] = r.id;
  }
  return map;
}
