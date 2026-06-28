// qa/cases/tarot.ts — 타로 4스프레드 케이스.
import type { Case } from "../types.ts";
import { buildSharedCases } from "./shared.ts";
import { SPREAD_INFO, type SpreadType, type SpreadCategory } from "../../lib/tarot/spreads.ts";

const SPREAD_SETUP: { spread: SpreadType; category: SpreadCategory; emotion: Case["emotion"] }[] = [
  { spread: "one_card", category: "worry", emotion: "요즘 내 흐름이 궁금해" },
  { spread: "two_card", category: "decision", emotion: "어떤 선택이 맞을지 모르겠어" },
  { spread: "three_card", category: "love", emotion: "그 사람 마음이 궁금해" },
  { spread: "relationship_5", category: "interpersonal", emotion: "관계 때문에 마음이 쓰여" },
];

export function tarotCases(): Case[] {
  const cases: Case[] = [];
  for (const s of SPREAD_SETUP) {
    // one_card 는 단일 카드라 [CARD:n] 마커를 쓰지 않음(페르소나 설계) → 기대 0개.
    // 멀티카드(2/3/5)는 카드 직전 마커가 카드 수만큼 등장.
    const expectCardCount = s.spread === "one_card" ? 0 : SPREAD_INFO[s.spread].cardCount;
    cases.push(
      ...buildSharedCases(
        { kind: "tarot", spreadType: s.spread, spreadCategory: s.category },
        s.emotion,
        `tarot.${s.spread}`,
        { mustEnd: true, expectSensitiveHeader: false, expectCardCount }
      )
    );
  }
  return cases;
}
