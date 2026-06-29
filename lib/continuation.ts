// 이어가기 가격 헬퍼 — deep 은 상품 정가의 60%(="40% 할인") 반올림, fresh 는 정가.
// 가격 기준은 부모 stars_spent 가 아니라 상품 정가 — 체인(이어가기를 또 이어가기) 시
// 할인이 누적돼 0으로 수렴하는 것 방지.

import { SAJU_READING_COST } from "@/lib/saju/constants";
import { SPREAD_INFO, type SpreadType } from "@/lib/tarot/spreads";

export const CONTINUATION_DISCOUNT_RATE = 0.6;

export type ContinuationMode = "fresh" | "deep";

export function continuationPrice(fullCost: number, mode: ContinuationMode): number {
  if (mode === "fresh") return fullCost;
  return Math.round(fullCost * CONTINUATION_DISCOUNT_RATE);
}

export function fullCostFor(opts: {
  consultationType: "saju" | "tarot";
  spreadType?: SpreadType | null;
}): number {
  if (opts.consultationType === "tarot" && opts.spreadType) {
    return SPREAD_INFO[opts.spreadType].starCost;
  }
  return SAJU_READING_COST;
}
