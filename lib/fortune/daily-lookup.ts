// 오늘(한국시간) 이미 본 "오늘의 운세" 리딩 찾기 — 같은 날 재구매 시 중복 생성·과금 방지.

import { getServiceSupabase } from "@/lib/supabase";
import { FORTUNE_CONFIG } from "@/lib/fortune/types";

/** 한국시간(KST, UTC+9) 기준 오늘 0시~내일 0시 구간을 UTC ISO 문자열로 반환. */
export function kstDayWindowUtc(now: Date = new Date()): { start: string; end: string } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const startUtcMs =
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) -
    9 * 60 * 60 * 1000;
  return {
    start: new Date(startUtcMs).toISOString(),
    end: new Date(startUtcMs + 24 * 60 * 60 * 1000).toISOString(),
  };
}

/** 이 유저가 오늘(KST) 이미 만든 오늘의 운세 리딩 id. 없으면 null. */
export async function findTodaysDailyReadingId(userId: string): Promise<string | null> {
  const { start, end } = kstDayWindowUtc();
  const { data } = await getServiceSupabase()
    .from("readings")
    .select("id")
    .eq("user_id", userId)
    .eq("emotion_tag", FORTUNE_CONFIG.daily.emotionTag)
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}
