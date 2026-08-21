// 별자리 다인원 스케일(§7) — 인원수에 따라 별·선·라벨 크기 적응. 순수 함수.
// n≤6 = P3-1 기본값 유지(소규모 회귀 없음), n≥16 = 축소, 사이는 선형보간.
export interface SizeSpec {
  hostOuter: number;
  hostInner: number;
  starOuter: number;
  starInner: number;
  meR: number;
  hitR: number;
  lineWidth: number;
  goldLineWidth: number;
  labelFont: number;
  hostLabelFont: number;
  showLabels: boolean;
}

// hostInner/starInner = 별 통통함(inner/outer≈0.55) — 뾰족한 별이 싫다는 피드백 반영해 plump.
const FEW: Omit<SizeSpec, "showLabels"> = {
  hostOuter: 6, hostInner: 3.3, starOuter: 4, starInner: 2.2, meR: 4, hitR: 6,
  lineWidth: 0.4, goldLineWidth: 0.8, labelFont: 2.8, hostLabelFont: 3.4,
};
const MANY: Omit<SizeSpec, "showLabels"> = {
  hostOuter: 4.5, hostInner: 2.48, starOuter: 2.6, starInner: 1.43, meR: 2.8, hitR: 4.5,
  lineWidth: 0.28, goldLineWidth: 0.55, labelFont: 2, hostLabelFont: 2.6,
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const round = (n: number) => Math.round(n * 100) / 100;

/** 인원 n 에 맞춘 크기. 6명↓=FEW, 16명↑=MANY, 사이 선형보간. 라벨은 20명↓만. */
export function scaleForCount(n: number): SizeSpec {
  const t = clamp01((n - 6) / 10);
  const lerp = (a: number, b: number) => round(a + (b - a) * t);
  return {
    hostOuter: lerp(FEW.hostOuter, MANY.hostOuter),
    hostInner: lerp(FEW.hostInner, MANY.hostInner),
    starOuter: lerp(FEW.starOuter, MANY.starOuter),
    starInner: lerp(FEW.starInner, MANY.starInner),
    meR: lerp(FEW.meR, MANY.meR),
    hitR: lerp(FEW.hitR, MANY.hitR),
    lineWidth: lerp(FEW.lineWidth, MANY.lineWidth),
    goldLineWidth: lerp(FEW.goldLineWidth, MANY.goldLineWidth),
    labelFont: lerp(FEW.labelFont, MANY.labelFont),
    hostLabelFont: lerp(FEW.hostLabelFont, MANY.hostLabelFont),
    showLabels: n <= 20,
  };
}
