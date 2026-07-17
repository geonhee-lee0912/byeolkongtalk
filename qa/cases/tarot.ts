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

  // W1 신설 스프레드 4종 — 7/6/6/7장 심층 스프레드가 카드 수만큼 마커를 내고
  // 늘어난 WRAP_THRESHOLDS 안에서 [END]까지 자연 수렴하는지 확인.
  cases.push({
    id: "tarot.reunion_deep_7",
    product: { kind: "tarot", spreadType: "reunion_deep_7", spreadCategory: "love" },
    emotion: "재회할 수 있을까",
    seed: {},
    seedConcern:
      "3개월 전에 헤어졌는데 아직도 그 사람 생각이 자주 나. 다시 만날 수 있을지, 만나도 괜찮을지 궁금해",
    userPersona:
      "평범하게 재회 가능성을 궁금해하며 별콩이 말에 차분히 수긍하는 사용자",
    inputStyle: { tone: "차분한 반말", habits: [] },
    maxTurns: 6,
    expects: { mustEnd: true, expectSensitiveHeader: false, expectCardCount: 7 },
  });
  cases.push({
    id: "tarot.checkin_6",
    product: { kind: "tarot", spreadType: "checkin_6", spreadCategory: "love" },
    emotion: "요즘 우리, 예전 같지 않아",
    seed: {},
    seedConcern:
      "3년 사귄 남자친구랑 요즘 자꾸 다투고 예전만큼 애틋하지 않은 것 같아. 우리 관계가 지금 어떤 상태인지 알고 싶어",
    userPersona: "평범하게 관계 상태를 점검받고 싶어하는 사용자",
    inputStyle: { tone: "차분한 반말", habits: [] },
    maxTurns: 6,
    expects: { mustEnd: true, expectSensitiveHeader: false, expectCardCount: 6 },
  });
  // 비연애 재사용 검증: 이직 고민에 "계속?그만?" 스프레드 적용 — "헤어져/그만둬" 단정 판정이 없는지.
  cases.push({
    id: "tarot.stay_or_go_6",
    product: { kind: "tarot", spreadType: "stay_or_go_6", spreadCategory: "decision" },
    emotion: "어떤 선택이 맞을지 모르겠어",
    seed: {},
    seedConcern:
      "지금 다니는 회사를 계속 다녀야 할지 이직을 해야 할지 반년째 고민만 하고 결정을 못 내리고 있어",
    userPersona: "'그만두는 게 맞아 계속 다니는 게 맞아' 식으로 확답을 요구하는 사용자",
    inputStyle: { tone: "조급한 반말", habits: [] },
    maxTurns: 6,
    expects: { mustEnd: true, expectSensitiveHeader: false, expectCardCount: 6 },
  });
  cases.push({
    id: "tarot.chakra_7",
    product: { kind: "tarot", spreadType: "chakra_7", spreadCategory: "mental" },
    emotion: "그냥 별콩이한테 털어놓고 싶어",
    seed: {},
    seedConcern:
      "딱히 큰 일은 없는데 요즘 마음이 붕 뜬 것처럼 허전하고 뭔가 정리가 안 되는 기분이야",
    userPersona: "차분하게 자기 마음 상태를 털어놓는 사용자",
    inputStyle: { tone: "담담한 반말", habits: [] },
    maxTurns: 6,
    expects: { mustEnd: true, expectSensitiveHeader: false, expectCardCount: 7 },
  });

  return cases;
}
