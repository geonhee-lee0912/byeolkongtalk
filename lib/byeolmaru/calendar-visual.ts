// lib/byeolmaru/calendar-visual.ts — 달력 판의 점수 → 시각 매핑(순수 · 네트워크 0).
// 🔴 두 표면(7일 스트립 · 월간 격자)이 **같은 원천**(DayCell.score)을 쓴다 — 스트립은 막대 높이,
//    격자는 색 농도. 매핑을 한 파일에 두는 이유는 둘이 어긋나면 같은 날이 두 곳에서 다른 세기로
//    보이기 때문이다(21~27 은 실제로 두 표면에 동시에 뜬다).
// 🔴 등급 3단(dayGrade)을 배경에 쓰지 않는다 — 실측 5,400칸에서 normal 이 64% 라 7칸 중 4~5칸이
//    같은 색이 됐다. 점수는 그 원재료고 서로 다른 값이 38종이라 칸이 겹치지 않는다.
import { dayGrade } from "./day-score.ts";

const clamp100 = (n: number): number => Math.max(0, Math.min(100, n));

/** good 구간인가. 🔴 임계 숫자를 여기 다시 적지 않는다 — dayGrade 가 정본이다. */
export function isGoodScore(score: number): boolean {
  return dayGrade(clamp100(score)).tone === "good";
}

const BAR_MIN_PX = 4;
const BAR_MAX_PX = 28;

/** 스트립 막대 높이(px). 바닥 4px 은 실측 최저점(12)도 막대가 보이게 하는 값. */
export function barHeightPx(score: number): number {
  return Math.round(BAR_MIN_PX + (clamp100(score) / 100) * (BAR_MAX_PX - BAR_MIN_PX));
}

const GOLD = "#E8C26A";
const LILAC = "#9F8AD0";

function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 100) / 100;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** 스트립 막대 색 — 단색이되 good 만 금색. caution 은 막대가 짧은 것으로 이미 말해진다. */
export function barColor(score: number): string {
  return isGoodScore(score) ? GOLD : "#B8A8D8";
}

/** 격자 셀 배경 — 양방향(diverging) 채도.
 *  🔴 단방향("점수 높을수록 진함")은 틀렸다 — 살짝 챙길 날이 제일 연해져 사라진다. 격자가 답할
 *     질문은 "어느 날이 **눈여겨볼** 날인가"이고 그건 좋은 날과 챙길 날 양쪽이다.
 *  🔴 알파 바닥 0.12 는 판(PANEL_BG #ffffff) 위에서 칸이 사라지지 않는 하한이다. 현행 normal 칸
 *     (#F4F2F7 ≈ #9F8AD0 12%)과 같은 값이라 "이 정도면 보인다"가 이미 실측된 지점이다.
 *     순백+순백 / 크림+순백 조합으로 두 번 되돌린 이력이 CalendarGrid.tsx 주석에 있다. */
export function cellTint(score: number): string {
  const s = clamp100(score);
  if (isGoodScore(s)) return rgba(GOLD, 0.45 + ((s - 70) / 30) * 0.5);
  return rgba(LILAC, 0.55 - (s / 70) * 0.43);
}

const SUMMARY_MAX_DATES = 3;

/** 월간 격자 접힘 버튼 문구. 접힌 상태에서도 정보가 남게 "좋은 날"을 앞세운다.
 *  🔴 챙길 날 수를 앞세우지 않는다(스펙 §15-1 완화 — 좋은 날 중심 서술). */
export function monthSummaryLabel(goodDates: string[]): string {
  if (goodDates.length === 0) return "이번 달 전체 보기";
  const days = goodDates.map((d) => `${Number(d.slice(8, 10))}일`);
  const head = days.slice(0, SUMMARY_MAX_DATES).join(" · ");
  const rest = days.length - SUMMARY_MAX_DATES;
  return `이번 달 · 잘 맞는 날 ${head}${rest > 0 ? ` 외 ${rest}일` : ""}`;
}
