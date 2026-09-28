// lib/byeolmaru/report-date.ts — 리포트 대상 날짜 정책(순수 · 네트워크 0).
// 과거는 "있던 것만"(소급 생성 금지 — 그때 받은 글이 아니면 기록이 아니다), 생성은 오늘만.
// 🔴 미래 3일 생성은 2026-09-26 에 폐지됐다. 그건 P6 스펙이 "덤이지 파는 물건이 아니다"라고
//    적은 것이고, 그 3일을 설명하는 유일한 UI(허브 스트립의 점선 칸 3개)가 같은 날 삭제됐다.

/** 미래 리포트를 만들어주는 일수. 0 = 오늘만. */
export const FUTURE_REPORT_DAYS = 0;

/** YYYY-MM-DD 이고 달력상 실재하는 날짜인가. */
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  // "2026-02-30" 처럼 형식은 맞지만 없는 날짜를 거른다 — Date 가 다음 달로 굴려버리므로 되돌려 대조한다.
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);
}

export type ReportDatePolicy = "generate" | "cache_only" | "out_of_range";

/** 이 날짜를 어떻게 다룰지. todayKst 는 KST 기준 오늘(kstDate() 산출물).
 *  🔴 date 만 `unknown` 인 건 의도적이다 — date 는 쿼리스트링에서 온 신뢰 불가 입력이고,
 *     todayKst 는 서버가 kstDate() 로 만든 값이라 이미 형식이 보장된다. */
export function reportDatePolicy(date: unknown, todayKst: string): ReportDatePolicy {
  if (!isIsoDate(date) || !isIsoDate(todayKst)) return "out_of_range";
  const d = diffDays(date, todayKst);
  if (d < 0) return "cache_only";
  if (d <= FUTURE_REPORT_DAYS) return "generate";
  return "out_of_range";
}

/** 화면·프롬프트에서 그 날을 부르는 말. */
export function dayWordFor(date: string, todayKst: string): "오늘" | "그날" {
  return date === todayKst ? "오늘" : "그날";
}
