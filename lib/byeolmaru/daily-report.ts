// lib/byeolmaru/daily-report.ts — 유료 오늘 사주 리포트 캐시 래퍼((유저,날짜)별 1회 생성).
import { getServiceSupabase } from "@/lib/supabase";
import type { DailyReport } from "@/lib/fortune/daily-report";

/** 캐시된 리포트 조회. 없으면 null. */
export async function getCachedDailyReport(userId: string, dateStr: string): Promise<DailyReport | null> {
  const { data, error } = await getServiceSupabase()
    .from("byeolmaru_daily_report")
    .select("report")
    .eq("user_id", userId)
    .eq("report_date", dateStr)
    .maybeSingle();
  if (error || !data) return null;
  return data.report as DailyReport;
}

/** 리포트 저장. 이미 있으면(동시 생성) 덮지 않는다(23505 무시). */
export async function saveDailyReport(userId: string, dateStr: string, report: DailyReport): Promise<void> {
  const { error } = await getServiceSupabase()
    .from("byeolmaru_daily_report")
    .insert({ user_id: userId, report_date: dateStr, report });
  if (error && (error as { code?: string }).code !== "23505") {
    throw error;
  }
}
