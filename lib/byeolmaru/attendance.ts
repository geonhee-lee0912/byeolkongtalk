// lib/byeolmaru/attendance.ts — 별마루 출석: 순수 스트릭 + DB(체크인·상태·보상 lazy grant).
import { getServiceSupabase } from "@/lib/supabase";
import { chargeStars } from "@/lib/stars";
import { kstDate } from "@/lib/admin-time";

export const ATTENDANCE_THRESHOLD = 20;    // 구독 30일 중 20일 출석 → 보상
export const ATTENDANCE_REWARD_STARS = 10; // 구독료(20)의 절반. 보상 ≥ 구독료면 구독이 무료가 됨(스펙 §6)

export type AttendanceState = {
  checkedInToday: boolean;
  streak: number;
  daysThisSub: number | null; // 구독자만 — 활성 구독 창 내 출석일수. 비구독자 null.
  threshold: number;
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

/** 활성 구독(expires_at > now, 최신) 1건. 없으면 null. */
async function activeSub(userId: string): Promise<{ started_at: string; expires_at: string } | null> {
  const supa = getServiceSupabase();
  const { data } = await supa
    .from("byeolmaru_subscriptions")
    .select("started_at, expires_at")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
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
  const streak = computeStreak(dates, todayKst);
  const checkedInToday = dates.includes(todayKst);

  const sub = await activeSub(userId);
  let daysThisSub: number | null = null;
  if (sub) {
    const startDate = kstDate(sub.started_at); // TIMESTAMPTZ → KST 날짜(checkin_date 와 동일 기준)
    const { count } = await supa
      .from("byeolmaru_checkins")
      .select("checkin_date", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("checkin_date", startDate)
      .lte("checkin_date", todayKst);
    daysThisSub = count ?? 0;
  }
  return { checkedInToday, streak, daysThisSub, threshold: ATTENDANCE_THRESHOLD };
}

/** 오늘 출석 기록(멱등 — 복합 PK 로 하루 1행). 기록 후 최신 상태 반환. */
export async function recordCheckin(userId: string, todayKst: string): Promise<AttendanceState> {
  const supa = getServiceSupabase();
  await supa
    .from("byeolmaru_checkins")
    .upsert({ user_id: userId, checkin_date: todayKst }, { onConflict: "user_id,checkin_date", ignoreDuplicates: true });
  return getAttendanceState(userId, todayKst);
}

/**
 * 만료·미정산 구독의 출석 보상을 다음 방문에서 lazy 정산한다(만료된 모든 미정산 구독 순회).
 * 창 내 출석 ≥ THRESHOLD 면 10별 지급(멱등키=구독 id). reward_granted_at 은 "정산됨" 마킹인데,
 * 자격(≥THRESHOLD)인데 chargeStars 가 실패하면 마킹을 보류한다 — 다음 방문에서 재시도(멱등키라 안전).
 * 미자격(<THRESHOLD)이거나 지급 성공이면 마킹. 동시 호출은 chargeStars 멱등(payment_id) + CAS 로 안전.
 */
export async function grantDueReward(userId: string): Promise<void> {
  const supa = getServiceSupabase();
  const nowIso = new Date().toISOString();
  const { data } = await supa
    .from("byeolmaru_subscriptions")
    .select("id, started_at, expires_at")
    .eq("user_id", userId)
    .lte("expires_at", nowIso)
    .is("reward_granted_at", null)
    .order("expires_at", { ascending: false });

  for (const sub of data ?? []) {
    const { count } = await supa
      .from("byeolmaru_checkins")
      .select("checkin_date", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("checkin_date", kstDate(sub.started_at as string))
      .lte("checkin_date", kstDate(sub.expires_at as string));

    let settle = true;
    if ((count ?? 0) >= ATTENDANCE_THRESHOLD) {
      // 멱등: payment_id=구독 id 로 charge_stars 가 중복 지급을 막는다(TEXT, FK 없음).
      const res = await chargeStars(userId, ATTENDANCE_REWARD_STARS, `byeolmaru_reward_${sub.id}`, "byeolmaru_attendance_reward");
      settle = res.success; // 지급 실패(일시적 RPC 에러)면 마킹 보류 → 다음 방문 재시도
    }
    if (settle) {
      await supa
        .from("byeolmaru_subscriptions")
        .update({ reward_granted_at: nowIso })
        .eq("id", sub.id)
        .is("reward_granted_at", null);
    }
  }
}
