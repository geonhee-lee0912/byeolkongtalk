// lib/admin/band.ts — 7일 롤링과 8주 분포 밴드. 순수(DB·React import 0).
//
// 🔴 왜 롤링인가 — 결제가 하루 3.5건이라 일별 손익이 −₩11k~+₩40k 로 요동한다. 일별 값을 1층
//    주 지표로 쓰면 매일 "큰 변화"가 보이고 그게 전부 노이즈다(스펙 §3).
// 🔴 왜 밴드인가 — "이 변동이 신호인가 노이즈인가"에 답하는 유일한 장치. 최근 8주의 롤링 값
//    분포에서 오늘이 어디쯤인지 보여준다.

export interface DailyPnl {
  /** KST 날짜 YYYY-MM-DD */
  bucket: string;
  revenueWon: number;
  adSpendWon: number;
  apiCostWon: number;
  /** 🔴 그 날 llm_usage 행 수. 0 = 미축적(원가 0원과 구별된다). */
  costRows: number;
}

/** 7일 합의 이동 배열. 창이 차지 않는 앞 6일은 버린다(부분 합은 낮게 나와 밴드를 왜곡한다). */
export function rolling7(values: number[]): number[] {
  if (values.length < 7) return [];
  const out: number[] = [];
  let sum = values.slice(0, 7).reduce((a, b) => a + b, 0);
  out.push(sum);
  for (let i = 7; i < values.length; i++) {
    sum += values[i] - values[i - 7];
    out.push(sum);
  }
  return out;
}

/** 선형보간 분위수. `sorted` 는 오름차순이어야 한다. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface Band {
  p10: number;
  p90: number;
  current: number;
  /** 현재값의 백분위(0~100). 화면 캡션("하위 27%")에 쓴다. */
  pctRank: number;
  /** P10~P90 밖인가 — 마커가 빨강이 된다. */
  outside: boolean;
  /**
   * 🔴 분포에 폭이 없다(p10 === p90). 8주 내내 값이 똑같았다는 뜻이다.
   * 이때 pctRank 는 구조적으로 100 이 되고 outside 는 false 라, 호출부가 이 신호를 무시하면
   * "평소 범위 안 · 분포 중 100% 위치"라는 **오해를 부르는 캡션**이 나온다.
   * 화면은 이 경우 위치 대신 "변동 없음"을 말해야 한다.
   */
  flat: boolean;
}

/**
 * 밴드 계산. 마지막 값이 "현재"다.
 * 표본 8개 미만이면 null — 분위수가 사실상 최소/최대가 되어 "범위 안"이 무의미해진다.
 */
export function computeBand(rolling: number[]): Band | null {
  if (rolling.length < 8) return null;
  const current = rolling[rolling.length - 1];
  const sorted = [...rolling].sort((a, b) => a - b);
  const p10 = quantile(sorted, 0.1);
  const p90 = quantile(sorted, 0.9);
  // 백분위 = 현재값 이하인 표본의 비율. 동률은 아래로 센다(보수적).
  const pctRank = (sorted.filter((v) => v <= current).length / sorted.length) * 100;
  return { p10, p90, current, pctRank, outside: current < p10 || current > p90, flat: p10 === p90 };
}

export interface CostCoverage {
  /** 원가 행이 하나라도 있는 날의 수. */
  covered: number;
  total: number;
  /** 창의 모든 날이 덮였는가. */
  full: boolean;
}

/**
 * 🔴 `apiCostWon = 0` 과 "그 날 원가를 기록하지 않았다"는 전혀 다른 말이다.
 * llm_usage 는 2026-09-20 부터 쌓이므로 그 이전은 **영원히 비어 있다**(소급 불가).
 */
export function costCoverage(days: DailyPnl[]): CostCoverage {
  const covered = days.filter((d) => d.costRows > 0).length;
  return { covered, total: days.length, full: days.length > 0 && covered === days.length };
}

/** 밴드를 어느 축으로 그릴지. 성분 구성이 다른 값을 한 분포에 섞으면 밴드가 거짓말을 한다. */
export type BandAxis = "contribution" | "marketing";

export function pickBandAxis(days: DailyPnl[]): BandAxis {
  return costCoverage(days).full ? "contribution" : "marketing";
}

/** 축에 맞는 일별 값 배열. `contribution` 은 원가까지 뺀다. */
export function dailyValues(days: DailyPnl[], axis: BandAxis): number[] {
  return days.map((d) =>
    axis === "contribution" ? d.revenueWon - d.adSpendWon - d.apiCostWon : d.revenueWon - d.adSpendWon
  );
}
