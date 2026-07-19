// qa/cases/gomintalk.ts — 고민톡(타로 직행) 실측 그라운디드 케이스.
//
// 근거: scripts/qual-results.json — 실제 prod 대화 65건 정성 코딩.
//   갈증 분포: 상대마음확인 35% · 재회가능성 32% · 연락올까 · 시기집요 · 자기감정정리 · 이중고민
//   반복 실패: 심문피로 23%(단답 연속에도 되질문/이지선다 연발 → 증발) · 일방 종료(유저 질문 무시)
//              · 확답 압박 → 회피 상용구 누적 → 김빠짐 · 막연한 개방형("뭐든 물어봐")이 오히려 부담
//
// 검증 축은 도메인 무관 화법(judge v3 7차원)이지만, 발화·상황을 실측 최빈 패턴으로 재현해서
// "실제 유저가 많이 하는 발화 + 자주 겪는 상황에서의 별콩이 대처"를 본다. id 접두사는 `tarot.real.*`.
import type { Case } from "../types.ts";

export function gomintalkCases(): Case[] {
  return [
    // ── 상대마음확인 (실측 최빈 35%) ──────────────────────────────────────
    // 썸 상대의 진심. 방향을 먼저 주는지(dim2) + 확인 유도에 심문으로 되받지 않는지(dim5).
    {
      id: "tarot.real.other_feelings",
      product: { kind: "tarot", spreadType: "three_card", spreadCategory: "love" },
      emotion: "걔 속마음이 궁금해",
      seed: {},
      seedConcern:
        "요즘 자주 연락하는 사람이 있는데 이게 나한테 관심이 있는 건지 그냥 사람이 좋은 건지 모르겠어",
      userPersona:
        "상대의 진심이 궁금해 별콩이 해석엔 차분히 반응하지만 '그래서 걔가 날 좋아하는 거야?'로 자꾸 확답을 확인하려는 사용자",
      inputStyle: { tone: "조심스러운 반말", habits: [] },
      maxTurns: 5,
      expects: { mustEnd: true, expectSensitiveHeader: false, expectCardCount: 3 },
    },

    // ── 재회가능성 (실측 32%) + 단답 연속 (실측 최빈 이탈 패턴) ────────────
    // "짧은 답 연속에도 되질문 지속 → 증발" 회귀 가드. 단답 2연속이면 질문 대신 정리/여백으로.
    {
      id: "tarot.real.reunion_terse",
      product: { kind: "tarot", spreadType: "three_card", spreadCategory: "love" },
      emotion: "재회할 수 있을까",
      seed: {},
      seedConcern:
        "두 달 전에 헤어졌는데 아직 미련이 남아. 걔도 내 생각 할까? 다시 만날 수 있을까",
      userPersona:
        "재회가 간절하지만 물어보면 'ㅇㅇ', '몰라', '그런가'처럼 단답만 반복하는 사용자",
      inputStyle: { tone: "ㅇㅇ·몰라 같은 초단답, 가라앉은 톤", habits: [] },
      maxTurns: 6,
      expects: {
        mustEnd: false,
        expectSensitiveHeader: false,
        expectCardCount: 3,
        skipEndAssertion: true,
      },
    },

    // ── 연락올까 + 시기/확답 압박 (실측) ─────────────────────────────────
    // "확답 재요구 → 회피 상용구 3회 누적 → 증발" 가드. 답 먼저 + 회피구 0회(dim2).
    {
      id: "tarot.real.will_contact_push",
      product: { kind: "tarot", spreadType: "three_card", spreadCategory: "love" },
      emotion: "언제 연락 올까, 타이밍이 궁금해",
      seed: {},
      seedConcern: "썸 타다 연락 끊긴 사람인데 다시 연락 올까? 온다면 언제쯤 올까?",
      userPersona:
        "'그래서 온다는 거야 안 온다는 거야', '며칠에?'처럼 가부와 날짜 확답을 집요하게 요구하는 사용자",
      inputStyle: { tone: "조급하고 몰아붙이는 반말", habits: [] },
      maxTurns: 6,
      expects: {
        mustEnd: false,
        expectSensitiveHeader: false,
        expectCardCount: 3,
        skipEndAssertion: true,
      },
    },

    // ── 이중 고민 (실측 note: "이별+수능 이중 고민을 습관 패턴 통찰로 잘 묶음") ──
    // 두 고민을 따로 흩뜨리지 않고 하나의 흐름으로 묶어 읽는지.
    {
      id: "tarot.real.dual_worry",
      product: { kind: "tarot", spreadType: "three_card", spreadCategory: "love" },
      emotion: "재회할 수 있을까",
      seed: {},
      seedConcern:
        "얼마 전에 남자친구랑 헤어졌는데 하필 다음 달이 시험이라 아무것도 손에 안 잡혀. 둘 다 너무 힘들어",
      userPersona:
        "이별과 시험이라는 두 고민을 한꺼번에 쏟아내고 어디서부터 풀어야 할지 막막해하는 사용자",
      inputStyle: { tone: "지친 반말", habits: [] },
      maxTurns: 5,
      expects: { mustEnd: true, expectSensitiveHeader: false, expectCardCount: 3 },
    },

    // ── 자기감정정리 + 막연한 개방 (실측: "열린 '뭐든 물어봐'가 오히려 부담") ──
    // one_card = [CARD] 마커 0개(페르소나 설계). 딱히 질문 없이 털어놓는 유저에게
    // 막연한 개방형("뭐 더 궁금한 거 있어?")로 공 떠넘기지 않고 방향을 잡아주는지.
    {
      id: "tarot.real.venting_open",
      product: { kind: "tarot", spreadType: "one_card", spreadCategory: "worry" },
      emotion: "그냥 별콩이한테 털어놓고 싶어",
      seed: {},
      seedConcern:
        "딱히 뭘 물어보고 싶은 건 아닌데 요즘 연애도 그렇고 마음이 붕 뜬 것 같고 그냥 답답해",
      userPersona:
        "구체적 질문 없이 감정만 털어놓다가, 별콩이가 '뭐가 제일 궁금해?'라고 되물으면 '그냥 다…'로 막막해하는 사용자",
      inputStyle: { tone: "느리고 담담한 반말", habits: [] },
      maxTurns: 5,
      expects: {
        mustEnd: false,
        expectSensitiveHeader: false,
        expectCardCount: 0,
        skipEndAssertion: true,
      },
    },

    // ── 고백/행동 딜레마 (상대마음확인 → 행동조언) ────────────────────────
    // 방향(고백 여부)에 소신 있게 답하되 단정 확언은 피하는지(dim1·dim2).
    {
      id: "tarot.real.confession_dilemma",
      product: { kind: "tarot", spreadType: "three_card", spreadCategory: "love" },
      emotion: "썸, 이 관계 어떻게 될까",
      seed: {},
      seedConcern:
        "한참 썸 타는 중인데 내가 먼저 고백해도 될까? 괜히 했다가 지금 이 분위기까지 깨질까 봐 무서워",
      userPersona:
        "고백할지 말지 결정을 못 내려 별콩이에게 등을 떠밀어 달라고 하면서도 거절당할까 두려워하는 사용자",
      inputStyle: { tone: "설레면서 불안한 반말", habits: [] },
      maxTurns: 5,
      expects: { mustEnd: true, expectSensitiveHeader: false, expectCardCount: 3 },
    },
  ];
}
