// lib/byeolmaru/calendar-visual.ts — 달력 판의 점수 → 시각 매핑(순수 · 네트워크 0).
// 🔴 스트립 삭제(2026-09-26) 이후 시각 표면은 월간 격자 하나다. 그래도 매핑은 이 한 파일에
//    남긴다 — CalendarGrid(칸 배경·숫자)와 ByeolmaruHub 의 TodayLead(오늘 N점)가 같은
//    DayCell.score 를 각자 다시 계산하면 둘이 어긋나 같은 날이 다른 숫자·세기로 보일 수 있다.
//    2차 설계(2026-09-24)부터 **주 신호는 점수 숫자**(scoreDisplay)이고, 면 색(cellTint)은
//    찾기 보조로만 쓴다 — 색이 정확한 값을 말하려던 1차(막대 높이·양방향 채도)는 실물에서 기각됐다.
// 🔴 등급 3단(dayGrade)을 배경에 쓰지 않는다 — 실측 5,400칸에서 normal 이 64% 라 7칸 중 4~5칸이
//    같은 색이 됐다. 점수는 그 원재료고 서로 다른 값이 38종이라 칸이 겹치지 않는다.
import { dayGrade } from "./day-score.ts";

const clamp100 = (n: number): number => Math.max(0, Math.min(100, n));

/** 모집단 점수 분포의 앵커 [score, percentile]. 12,960칸 실측(60갑자 교차 표본 × 30일).
 *  🔴 **선형 매핑으로 되돌리지 말 것.** 실데이터는 0~100 을 안 쓴다 — 실계정 한 달의 절반이
 *     51~61 안에 있었고, 0~100 선형에서는 그 구간이 막대 2.4px 라 7칸이 거의 같아 보였다
 *     (실물 검수 실패). 백분위를 태우면 "얼마나 드문 날인가"가 곧 높이·농도가 된다.
 *  🔴 고정 스케일이라는 성질은 유지된다 — 같은 점수는 언제나 같은 높이다. 주 안에서 min~max 를
 *     늘리는 상대 스케일이 아니다(그건 나쁜 주와 좋은 주를 똑같아 보이게 해서 기각됐다).
 *  재측정이 필요하면 day-score.ts 의 가중치가 바뀐 뒤다 — 그땐 이 표를 다시 뽑을 것. */
const SCORE_PERCENTILE_ANCHORS: readonly (readonly [number, number])[] = [
  [12, 0], [32, 0.05], [38, 0.1], [46, 0.2], [48, 0.3], [51, 0.4], [56, 0.5],
  [58, 0.6], [63, 0.7], [68, 0.8], [73, 0.9], [78, 0.95], [92, 1],
];

/** 점수 → 모집단 백분위(0~1). 앵커 사이는 선형 보간, 밖은 양끝으로 클램프. */
export function scorePercentile(score: number): number {
  const s = clamp100(score);
  const first = SCORE_PERCENTILE_ANCHORS[0];
  const last = SCORE_PERCENTILE_ANCHORS[SCORE_PERCENTILE_ANCHORS.length - 1];
  if (s <= first[0]) return first[1];
  if (s >= last[0]) return last[1];
  for (let i = 1; i < SCORE_PERCENTILE_ANCHORS.length; i++) {
    const [x1, y1] = SCORE_PERCENTILE_ANCHORS[i];
    if (s <= x1) {
      const [x0, y0] = SCORE_PERCENTILE_ANCHORS[i - 1];
      return y0 + ((s - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return last[1];
}

/** good 임계(70)의 백분위 — cellTint 의 두 구간을 가르는 지점. */
const GOOD_PERCENTILE = scorePercentile(70);

/** good 구간인가. 🔴 임계 숫자를 여기 다시 적지 않는다 — dayGrade 가 정본이다. */
export function isGoodScore(score: number): boolean {
  return dayGrade(clamp100(score)).tone === "good";
}

/** 화면에 찍는 점수(0~100). 🔴 **원점수를 쓰지 않는다** — 모집단 중앙이 56 이라 대부분의 날이
 *  "56"으로 떠서 학교 점수 프레임의 낙제로 읽힌다(실제로는 딱 평균인 날인데). 백분위를 태워야
 *  숫자가 "이 날이 얼마나 드문가"를 뜻한다. 고정 스케일이라 같은 점수는 언제나 같은 표시값이다. */
export function scoreDisplay(score: number): number {
  return Math.round(scorePercentile(score) * 100);
}

const GOLD = "#E8C26A";
const LILAC_DEEP = "#9F8AD0";

/** 🔴 hex 는 6자리 형식만 받는다(#RRGGBB) — 이 파일의 상수 셋이 유일한 호출자다. */
function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 100) / 100;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** 격자 셀 배경 — 양방향(diverging) 채도.
 *  🔴 단방향("점수 높을수록 진함")은 틀렸다 — 살짝 챙길 날이 제일 연해져 사라진다. 격자가 답할
 *     질문은 "어느 날이 **눈여겨볼** 날인가"이고 그건 좋은 날과 챙길 날 양쪽이다.
 *  🔴 알파 바닥 0.11 은 판(PANEL_BG #ffffff) 위에서 칸이 사라지지 않는 하한이다. 순백+순백 /
 *     크림+순백 조합으로 두 번 되돌린 이력이 CalendarGrid.tsx 주석에 있다.
 *  🔴 보라 상한 0.45(2026-09-26, 0.30 에서 올림) / 금색 0.45~0.65(불변). 0.30 에서는 실측
 *     보라 칸 전체가 0.14~0.29 에 몰려 3점과 64점이 구분되지 않았다(30칸이 다 찬 뒤 드러남).
 *     대비 실측: #5A3E8C on 보라 0.45 = 5.38, #412402 on 금 0.65 = 10.09.
 *  백분위로 다시 정규화한다 — 원점수 선형은 실데이터가 안 쓰는 범위라 대비가 안 났다. */
export function cellTint(score: number): string {
  const p = scorePercentile(score);
  if (isGoodScore(score)) {
    // good 구간을 백분위로 다시 정규화 — 임계 바로 위가 0.45, 모집단 최고가 0.65.
    const t = GOOD_PERCENTILE >= 1 ? 1 : (p - GOOD_PERCENTILE) / (1 - GOOD_PERCENTILE);
    return rgba(GOLD, 0.45 + Math.max(0, Math.min(1, t)) * 0.2);
  }
  // 🔴 바닥 0.11 은 good 임계 직전(p = GOOD_PERCENTILE)에서 정확히 나온다 — 0.45 − 0.34.
  //    바닥은 판(PANEL_BG #ffffff) 위에서 칸이 사라지지 않는 하한이라 **옮기지 않는다**.
  const t = Math.max(0, Math.min(1, p / GOOD_PERCENTILE));
  return rgba(LILAC_DEEP, 0.45 - t * 0.34);
}

// 🔴 monthSummaryLabel(좋은 날 날짜를 세던 버튼 문구)은 2026-09-24 에 제거됐다 — 버튼은
//    "이번 달 달력 보기" 고정 라벨로 간다(사용자 결정). 되살리려면 goodDates 를 허브에서 다시
//    계산해 내려야 한다.
