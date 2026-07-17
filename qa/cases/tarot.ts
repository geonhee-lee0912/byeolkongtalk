// qa/cases/tarot.ts — 타로 4스프레드 케이스.
import type { Case } from "../types.ts";
import { buildSharedCases } from "./shared.ts";
import { SPREAD_INFO, type SpreadType, type SpreadCategory } from "../../lib/tarot/spreads.ts";

const SPREAD_SETUP: { spread: SpreadType; category: SpreadCategory; emotion: Case["emotion"] }[] = [
  { spread: "one_card", category: "worry", emotion: "그냥 별콩이한테 털어놓고 싶어" },
  { spread: "two_card", category: "decision", emotion: "어떤 선택이 맞을지 모르겠어" },
  { spread: "three_card", category: "love", emotion: "걔 속마음이 궁금해" },
  { spread: "relationship_5", category: "interpersonal", emotion: "직장·학교에서 사람이 어려워" },
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
  // C1 전환 규칙: 카드를 더 뽑아달라는 구매 의사 신호를 말리지 않고 경로+선택권으로 안내하는지.
  cases.push({
    id: "tarot.three_card.more_cards",
    product: { kind: "tarot", spreadType: "three_card", spreadCategory: "love" },
    emotion: "걔 속마음이 궁금해",
    seed: {},
    seedConcern: "헤어진 사람한테 연락이 올까? 계속 생각나",
    userPersona:
      "풀이를 듣다가 '카드 더 뽑아줘', '타로 새로 봐줘'를 두 번 이상 요청하는 사용자",
    inputStyle: { tone: "간절한 반말", habits: [] },
    maxTurns: 5,
    expects: {
      mustEnd: false,
      expectSensitiveHeader: false,
      expectCardCount: 3,
      skipEndAssertion: true,
    },
  });
  // C1 크로스셀: 달력 수준 시기 질문을 파고들 때 방향 답 + 사주 '좋은 날' 안내가 나오는지.
  cases.push({
    id: "tarot.three_card.timing_push",
    product: { kind: "tarot", spreadType: "three_card", spreadCategory: "love" },
    emotion: "걔 속마음이 궁금해",
    seed: {},
    seedConcern: "헤어진 사람이랑 재회하고 싶어. 언제쯤 연락하면 좋을까?",
    userPersona:
      "'좋은 날이 언제야?', '몇 월에?', '며칠에 연락할까?' 처럼 구체적인 날짜를 집요하게 묻는 사용자",
    inputStyle: { tone: "조급한 반말", habits: [] },
    maxTurns: 5,
    expects: {
      mustEnd: false,
      expectSensitiveHeader: false,
      expectCardCount: 3,
      skipEndAssertion: true,
    },
  });
  return cases;
}
