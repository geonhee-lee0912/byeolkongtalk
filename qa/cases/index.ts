// qa/cases/index.ts — 전체 케이스 수집 + CLI 필터.
import type { Case } from "../types.ts";
import { sajuCases } from "./saju.ts";

export function allCases(): Case[] {
  return [...sajuCases()];
}

export interface CaseFilter {
  /** "saju:today_letters" 또는 "tarot:three_card" — product 매칭 */
  product?: string;
  /** 케이스 key 부분 매칭 (예: "crisis") */
  caseKey?: string;
  /** 상한 */
  max?: number;
}

function productMatches(c: Case, sel: string): boolean {
  if (c.product.kind === "saju") return `saju:${c.product.sajuProduct}` === sel;
  return `tarot:${c.product.spreadType}` === sel;
}

export function collectCases(f: CaseFilter): Case[] {
  let cs = allCases();
  if (f.product) cs = cs.filter((c) => productMatches(c, f.product!));
  if (f.caseKey) cs = cs.filter((c) => c.id.includes(f.caseKey!));
  if (f.max != null) cs = cs.slice(0, f.max);
  return cs;
}
