import type { SajuResult } from "@/lib/saju/calc";
import type { FiveElement } from "@/lib/saju/elements";
import { STEM_ELEMENT, elementRelation, tenGod } from "@/lib/saju/pairing";
import type { AxisKey, Pole } from "./constants.ts";
import {
  JANGAN_BONGI,
  POSITION_WEIGHT,
  STEM_ORDER,
  BRANCH_ORDER,
  ELEMENT_YINYANG,
  DAY_STEM_PAIR_WEIGHT,
  DAY_STEM_ELEMENT_WEIGHT,
  QUANTILE_TABLE,
} from "./constants.ts";

export interface CharCell {
  char: string;
  isStem: boolean;
  weight: number;
}

/** 일간 제외, 시간 모름이면 시주 제외한 글자·가중치 목록. */
export function activeChars(saju: SajuResult): CharCell[] {
  const p = saju.pillars;
  const cells: CharCell[] = [
    { char: p.year.stem, isStem: true, weight: POSITION_WEIGHT.yearStem },
    { char: p.year.branch, isStem: false, weight: POSITION_WEIGHT.yearBranch },
    { char: p.month.stem, isStem: true, weight: POSITION_WEIGHT.monthStem },
    { char: p.month.branch, isStem: false, weight: POSITION_WEIGHT.monthBranch },
    { char: p.day.branch, isStem: false, weight: POSITION_WEIGHT.dayBranch },
  ];
  if (saju.input.hourKnown) {
    cells.push({ char: p.hour.stem, isStem: true, weight: POSITION_WEIGHT.hourStem });
    cells.push({ char: p.hour.branch, isStem: false, weight: POSITION_WEIGHT.hourBranch });
  }
  return cells;
}

/** 글자가 환원되는 천간(천간 그대로 / 지지는 본기). */
export function stemOf(cell: CharCell): string {
  return cell.isStem ? cell.char : JANGAN_BONGI[cell.char];
}

/** 글자의 오행(본기 환원 기준). */
export function elementOf(cell: CharCell): FiveElement {
  return STEM_ELEMENT[stemOf(cell)];
}

/** 음/양 raw. + = 양. 표기상(표면 index 짝수=양) 0.7 + 오행기질(목화+1·금수-1·토0, 본기) 0.3, 위치가중. */
export function yinYangRaw(saju: SajuResult): number {
  let sum = 0;
  for (const cell of activeChars(saju)) {
    const order = cell.isStem ? STEM_ORDER : BRANCH_ORDER;
    const surfaceParity = order.indexOf(cell.char) % 2 === 0 ? 1 : -1;
    const elementYy = ELEMENT_YINYANG[elementOf(cell)];
    sum += (0.7 * surfaceParity + 0.3 * elementYy) * cell.weight;
  }
  return sum;
}

/** 일간을 돕는가(비겁=비화 / 인성=생아). */
function supportsDay(dayElement: FiveElement, other: FiveElement): boolean {
  const r = elementRelation(dayElement, other);
  return r === "비화" || r === "생아";
}

/** 강/유 raw = 득령(월지 40) + 득지(일지 20) + 득세(나머지 비겁·인성 세력 최대 40). 0~100, 클수록 강. */
export function strengthRaw(saju: SajuResult): number {
  const dayEl = saju.dayElement;
  const p = saju.pillars;
  const monthBranchEl = STEM_ELEMENT[JANGAN_BONGI[p.month.branch]];
  const dayBranchEl = STEM_ELEMENT[JANGAN_BONGI[p.day.branch]];

  const deukRyeong = supportsDay(dayEl, monthBranchEl) ? 40 : 0;
  const deukJi = supportsDay(dayEl, dayBranchEl) ? 20 : 0;

  // 득세: 나머지 위치(년간·년지·월간·[시간·시지]) — 월지(득령)·일지(득지)·일간(기준) 제외. 위치 기준(글자값 아님).
  const restCells: CharCell[] = [
    { char: p.year.stem, isStem: true, weight: POSITION_WEIGHT.yearStem },
    { char: p.year.branch, isStem: false, weight: POSITION_WEIGHT.yearBranch },
    { char: p.month.stem, isStem: true, weight: POSITION_WEIGHT.monthStem },
  ];
  if (saju.input.hourKnown) {
    restCells.push({ char: p.hour.stem, isStem: true, weight: POSITION_WEIGHT.hourStem });
    restCells.push({ char: p.hour.branch, isStem: false, weight: POSITION_WEIGHT.hourBranch });
  }
  let support = 0;
  let total = 0;
  for (const c of restCells) {
    total += c.weight;
    if (supportsDay(dayEl, elementOf(c))) support += c.weight;
  }
  const deukSe = total === 0 ? 0 : (support / total) * 40;

  return deukRyeong + deukJi + deukSe;
}

const WEALTH_CAMP = new Set(["편재", "정재", "편관", "정관"]);
const SEAL_CAMP = new Set(["편인", "정인", "식신", "상관"]);

/** 재/인 raw = 재진영 가중합 − 인진영 가중합. + = 재. */
export function wealthRaw(saju: SajuResult): number {
  let wealth = 0;
  let seal = 0;
  for (const cell of activeChars(saju)) {
    const god = tenGod(saju.dayStem, stemOf(cell));
    if (WEALTH_CAMP.has(god)) wealth += cell.weight;
    else if (SEAL_CAMP.has(god)) seal += cell.weight;
  }
  return wealth - seal;
}

/** 생/단 raw = 상생쌍 가중합 − 상극쌍 가중합. + = 생. 이웃쌍 = 간-지(각 기둥) + 인접천간 + 인접지지. */
export function nurtureRaw(saju: SajuResult): number {
  const p = saju.pillars;
  const hk = saju.input.hourKnown;

  type Node = { el: FiveElement; w: number };
  const stem = (ch: string, w: number): Node => ({ el: STEM_ELEMENT[ch], w });
  const branch = (ch: string, w: number): Node => ({ el: STEM_ELEMENT[JANGAN_BONGI[ch]], w });

  const yS = stem(p.year.stem, POSITION_WEIGHT.yearStem);
  const yB = branch(p.year.branch, POSITION_WEIGHT.yearBranch);
  const mS = stem(p.month.stem, POSITION_WEIGHT.monthStem);
  const mB = branch(p.month.branch, POSITION_WEIGHT.monthBranch);
  const dS = stem(p.day.stem, DAY_STEM_PAIR_WEIGHT);
  const dB = branch(p.day.branch, POSITION_WEIGHT.dayBranch);
  const hS = stem(p.hour.stem, POSITION_WEIGHT.hourStem);
  const hB = branch(p.hour.branch, POSITION_WEIGHT.hourBranch);

  const pairs: [Node, Node][] = [
    [yS, yB], [mS, mB], [dS, dB],
    [yS, mS], [mS, dS],
    [yB, mB], [mB, dB],
  ];
  if (hk) {
    pairs.push([hS, hB]);
    pairs.push([dS, hS]);
    pairs.push([dB, hB]);
  }

  let generate = 0;
  let restrain = 0;
  for (const [a, b] of pairs) {
    const rel = elementRelation(a.el, b.el);
    const w = (a.w + b.w) / 2;
    if (rel === "생아" || rel === "아생") generate += w;
    else if (rel === "극아" || rel === "아극") restrain += w;
  }
  return generate - restrain;
}

/** 오행 분포(본기 기준·위치가중). 주기질은 일간 포함(가중 1.5). */
export function elementDistribution(saju: SajuResult): Record<FiveElement, number> {
  const dist: Record<FiveElement, number> = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  for (const cell of activeChars(saju)) dist[elementOf(cell)] += cell.weight;
  dist[saju.dayElement] += DAY_STEM_ELEMENT_WEIGHT;
  return dist;
}

const ELEMENT_KEYS: FiveElement[] = ["목", "화", "토", "금", "수"];

/** 최다 오행. 동점이면 월지(본기) 오행 우선, 그래도 동점이면 정순(목화토금수). */
export function dominantElement(saju: SajuResult): FiveElement {
  const dist = elementDistribution(saju);
  const monthEl = STEM_ELEMENT[JANGAN_BONGI[saju.pillars.month.branch]];
  let best = ELEMENT_KEYS[0];
  for (const el of ELEMENT_KEYS) {
    if (dist[el] > dist[best]) best = el;
    else if (dist[el] === dist[best] && el === monthEl && best !== monthEl) best = el;
  }
  return best;
}

/** raw → 백분위(0~100). q: 21개 오름차순 분위점(P0,P5,...,P100). 선형보간. */
export function axisPercentile(raw: number, q: number[]): number {
  if (raw <= q[0]) return 0;
  if (raw >= q[q.length - 1]) return 100;
  for (let i = 1; i < q.length; i++) {
    if (raw <= q[i]) {
      const lo = q[i - 1];
      const hi = q[i];
      const frac = hi === lo ? 0 : (raw - lo) / (hi - lo);
      return (i - 1 + frac) * 5;
    }
  }
  return 100;
}

export interface AxisResult {
  raw: number;
  pct: number;
  pole: Pole;
}

export interface PaljaType {
  axes: {
    yinYang: AxisResult;
    strength: AxisResult;
    wealth: AxisResult;
    nurture: AxisResult;
  };
  code: string;
  element: FiveElement;
  elementDist: Record<FiveElement, number>;
  tenGods: string[];
  jangan: string[];
}

const POLES: Record<AxisKey, [Pole, Pole]> = {
  yinYang: ["양", "음"],
  strength: ["강", "유"],
  wealth: ["재", "인"],
  nurture: ["생", "단"],
};

function axisResult(key: AxisKey, raw: number): AxisResult {
  const pct = axisPercentile(raw, QUANTILE_TABLE[key]);
  const [front, back] = POLES[key];
  return { raw, pct, pole: pct >= 50 ? front : back };
}

export function paljaType(saju: SajuResult): PaljaType {
  const axes = {
    yinYang: axisResult("yinYang", yinYangRaw(saju)),
    strength: axisResult("strength", strengthRaw(saju)),
    wealth: axisResult("wealth", wealthRaw(saju)),
    nurture: axisResult("nurture", nurtureRaw(saju)),
  };
  const code = axes.yinYang.pole + axes.strength.pole + axes.wealth.pole + axes.nurture.pole;
  return {
    axes,
    code,
    element: dominantElement(saju),
    elementDist: elementDistribution(saju),
    tenGods: activeChars(saju).map((c) => tenGod(saju.dayStem, stemOf(c))),
    jangan: activeChars(saju).filter((c) => !c.isStem).map((c) => JANGAN_BONGI[c.char]),
  };
}
