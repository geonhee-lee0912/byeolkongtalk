// lib/byeolmaru/strip.ts — 허브 롤링 7일 스트립의 날짜 창(순수 · 네트워크 0).
// 스펙 §2-1: 오늘 중심 롤링이라 "이번 주"라는 개념이 없다 → 주 바뀜·월 경계로 칸 수가 출렁이지 않는다
// (요일 기준이면 월요일 6칸·토요일 1칸으로 흐린 칸이 출렁여 기각됐다).
// 🔴 미래 칸 수를 여기서 다시 정의하지 않는다 — report-date.ts 의 FUTURE_REPORT_DAYS 가 정본이다.
//    어긋나면 "흐리게 보이니 눌러보는 칸"과 "누르면 리포트가 생성되는 칸"이 달라져, 유저가 누른 칸이
//    out_of_range 로 거절되는 조합이 생긴다(스펙 §11 교차 계약).
import { FUTURE_REPORT_DAYS } from "./report-date.ts";

export const STRIP_PAST_DAYS = 3;
export const STRIP_LENGTH = STRIP_PAST_DAYS + 1 + FUTURE_REPORT_DAYS;

/** KST 날짜 문자열을 days 만큼 민다. UTC 자정 기준 산술이라 서버 TZ·DST 에 안 흔들린다. */
function shift(dateKst: string, days: number): string {
  return new Date(Date.parse(`${dateKst}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

/** 스트립이 덮는 날짜 범위(양끝 포함) — calcDailyLuckRange 인자로 그대로 쓴다. */
export function stripRange(todayKst: string): { start: string; end: string } {
  return { start: shift(todayKst, -STRIP_PAST_DAYS), end: shift(todayKst, FUTURE_REPORT_DAYS) };
}

/** 스트립 7칸의 날짜 — 과거→미래 순. 오늘은 항상 index STRIP_PAST_DAYS. */
export function stripDates(todayKst: string): string[] {
  return Array.from({ length: STRIP_LENGTH }, (_, i) => shift(todayKst, i - STRIP_PAST_DAYS));
}
