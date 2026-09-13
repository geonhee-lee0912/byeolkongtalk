// lib/byeolmaru/attendance.ts — 별마루 출석: 순수 스트릭 + DB(방문 시 자동 체크인·상태 조회).
import { getServiceSupabase } from "@/lib/supabase";

/** 출석 상태 — P5-2 부터 보상이 없다(스펙 §10: 보상은 그날의 운세 = 달력 칸이 열리는 것).
 *  스트릭은 "매일 오는가"의 표시용으로만 남는다. */
export type AttendanceState = {
  checkedInToday: boolean;
  streak: number;
};

/** "YYYY-MM-DD" 문자열 하루 단위 계산 — UTC 자정 기준(로컬 TZ 무관). */
function addDays(iso: string, delta: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** 오늘(또는 오늘 미출석 시 어제)에서 뒤로 이어지는 연속 출석일 수. 순수. */
export function computeStreak(dates: string[], today: string): number {
  const set = new Set(dates);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export async function getAttendanceState(userId: string, todayKst: string): Promise<AttendanceState> {
  const supa = getServiceSupabase();
  const since = addDays(todayKst, -60);
  const { data: rows } = await supa
    .from("byeolmaru_checkins")
    .select("checkin_date")
    .eq("user_id", userId)
    .gte("checkin_date", since);
  const dates = (rows ?? []).map((r) => r.checkin_date as string);
  return { checkedInToday: dates.includes(todayKst), streak: computeStreak(dates, todayKst) };
}

/** 오늘 출석 기록(멱등 — 복합 PK 로 하루 1행). 기록 후 최신 상태 반환. */
export async function recordCheckin(userId: string, todayKst: string): Promise<AttendanceState> {
  const supa = getServiceSupabase();
  await supa
    .from("byeolmaru_checkins")
    .upsert({ user_id: userId, checkin_date: todayKst }, { onConflict: "user_id,checkin_date", ignoreDuplicates: true });
  return getAttendanceState(userId, todayKst);
}
