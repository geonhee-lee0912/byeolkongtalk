// qa/cases/index.ts — 전체 케이스 수집 + CLI 필터.
import type { Case } from "../types.ts";
import { sajuCases } from "./saju.ts";
import { tarotCases } from "./tarot.ts";
import { relationshipCases, verdictCases } from "./relationship.ts";

export function allCases(): Case[] {
  return [...sajuCases(), ...tarotCases(), ...relationshipCases(), ...verdictCases()];
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
  switch (c.product.kind) {
    case "saju":
      return `saju:${c.product.sajuProduct}` === sel;
    case "tarot":
      return `tarot:${c.product.spreadType}` === sel;
    case "relationship":
      return sel === "relationship";
    case "verdict":
      return sel === "verdict";
  }
}

export function collectCases(f: CaseFilter): Case[] {
  let cs = allCases();
  if (f.product) cs = cs.filter((c) => productMatches(c, f.product!));
  if (f.caseKey) cs = cs.filter((c) => c.id.includes(f.caseKey!));
  if (f.max != null) cs = cs.slice(0, f.max);
  return cs;
}
