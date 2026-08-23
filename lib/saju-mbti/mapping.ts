import type { SajuResult } from "@/lib/saju/calc";
import type { FiveElement } from "@/lib/saju/elements";
import { STEM_ELEMENT } from "@/lib/saju/pairing";
import { JANGAN_BONGI, POSITION_WEIGHT } from "./constants.ts";

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
