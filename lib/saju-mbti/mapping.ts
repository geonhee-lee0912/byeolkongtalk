import type { SajuResult } from "@/lib/saju/calc";
import type { FiveElement } from "@/lib/saju/elements";
import { STEM_ELEMENT, elementRelation, tenGod } from "@/lib/saju/pairing";
import { JANGAN_BONGI, POSITION_WEIGHT, STEM_ORDER, BRANCH_ORDER, ELEMENT_YINYANG } from "./constants.ts";

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

  const rest = activeChars(saju).filter(
    (c) => !(c.char === p.month.branch && !c.isStem) && !(c.char === p.day.branch && !c.isStem)
  );
  let support = 0;
  let total = 0;
  for (const c of rest) {
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
