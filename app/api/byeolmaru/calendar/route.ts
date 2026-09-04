// 별마루 캘린더 — 오늘부터 30일 판정. 룰 100%(LLM 0) → API 원가 0.
// 서버 권위: 클라가 보낸 사주·날짜는 받지 않는다. 프로필에서 계산한다.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getServiceSupabase } from "@/lib/supabase";
import { calcSaju, calcTemporalLuck } from "@/lib/saju/calc";
import { profileRowToSajuInput } from "@/lib/saju/profile-input";
import { buildCalendar, weekBuckets, baseDateForKst } from "@/lib/byeolmaru/calendar";
import { kstDate } from "@/lib/admin-time";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 내 프로필 = is_primary 우선, 없으면 가장 먼저 만든 것 (idx_user_profiles_user 접근 패턴과 동일).
  const { data: rows } = await getServiceSupabase()
    .from("user_profiles")
    .select("birth_date, birth_time, is_lunar_input, is_leap_month, gender")
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1);

  const row = rows?.[0];
  // birth_date 는 P2 부터 nullable(생일 없는 프로필 가능) — 사주 판정은 생일이 필수.
  if (!row || !row.birth_date) {
    return NextResponse.json({ error: "no_profile" }, { status: 404 });
  }

  const input = profileRowToSajuInput(row);
  const saju = calcSaju(input);

  const todayKst = kstDate(new Date().toISOString());
  const temporal = calcTemporalLuck(baseDateForKst(todayKst), input.year, { includeMonth: true });
  const cells = buildCalendar(saju, temporal.dailyLuck ?? [], todayKst);

  return NextResponse.json({
    today: todayKst,
    todayGanji: temporal.day.stem + temporal.day.branch,
    cells,
    weeks: weekBuckets(cells),
  });
}
