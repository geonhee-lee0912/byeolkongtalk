import type { AxisKey, Pole } from "./constants.ts";
import type { AxisResult } from "./mapping.ts";

export type MatchBand = "천명" | "절충" | "거스름";

export interface MatchRate {
  matchCount: number; // 0~4
  band: MatchBand;
  perAxis: { axis: AxisKey; selfPole: Pole; paljaPole: Pole; agree: boolean }[];
}

const AXES: AxisKey[] = ["yinYang", "strength", "wealth", "nurture"];

/** 자아·팔자의 4축 극 일치 수 → 밴드. pct(크기) 는 쓰지 않는다(스펙 §3). */
export function matchRate(
  self: Record<AxisKey, AxisResult>,
  palja: Record<AxisKey, AxisResult>
): MatchRate {
  const perAxis = AXES.map((axis) => ({
    axis,
    selfPole: self[axis].pole,
    paljaPole: palja[axis].pole,
    agree: self[axis].pole === palja[axis].pole,
  }));
  const matchCount = perAxis.filter((a) => a.agree).length;
  const band: MatchBand = matchCount === 4 ? "천명" : matchCount >= 2 ? "절충" : "거스름";
  return { matchCount, band, perAxis };
}
