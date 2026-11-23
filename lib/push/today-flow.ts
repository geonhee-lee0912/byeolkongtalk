// 아침 알림에 실을 '오늘의 흐름' — 별마루 달력과 같은 규칙 계산(LLM 0, 네트워크 0). 생년월일 프로필 + KST 날짜만 본다.
// 계산은 app/api/byeolmaru/calendar/route.ts 와 같은 사슬: calcSaju → calcDailyLuckRange(오늘) → buildCalendar.
import { calcDailyLuckRange } from "@/lib/saju/calc";
import { profileRowToSaju } from "@/lib/saju/profile-input";
import { buildCalendar } from "@/lib/byeolmaru/calendar";
import { DAY_LINE, DAY_NAME } from "@/lib/byeolmaru/day-label";

export type ProfileRow = {
  birth_date: string | null;
  birth_time: string | null;
  is_lunar_input: boolean;
  is_leap_month: boolean;
  gender: string;
};

/** 오늘의 흐름 — name 은 하루 이름(예: "차곡차곡 쌓는 날"), line 은 두 문장 풀이. 생일이 없거나 계산이 안 되면 null */
export type TodayFlow = { name: string; line: string };

export function todayFlow(row: ProfileRow | null, todayKst: string): TodayFlow | null {
  if (!row?.birth_date) return null;
  const { saju } = profileRowToSaju(row);
  if (!saju) return null;
  const luck = calcDailyLuckRange(todayKst, todayKst);
  if (luck.length === 0) return null;
  const [cell] = buildCalendar(saju, luck, todayKst);
  if (!cell) return null;
  return { name: DAY_NAME[cell.tenGod], line: DAY_LINE[cell.tenGod] };
}
