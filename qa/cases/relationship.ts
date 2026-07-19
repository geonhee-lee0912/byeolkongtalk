// qa/cases/relationship.ts — 연애 상담(우리 사이) 스레드 + verdict 스킬 케이스.
// 스레드: [END] 없음(소프트캡/시뮬 stop 종료) + 패스 게이트. verdict: [END] 수렴(기존 배관 재사용).
import type { Case } from "../types.ts";
import { buildSharedCases } from "./shared.ts";
import { DAILY_TURN_CAP } from "../../lib/relationship/types.ts";

const REL_EMOTION = "걔 속마음이 궁금해";

/** 지속 스레드 — shared 11종 행동 커버(위기·인젝션·단답·burst·이탈 등) + 패스게이트 + 소프트캡.
 *  concern 은 shared spec 값(일부 커리어 맥락)을 그대로 상속 — 검증 대상은 시나리오별 '행동'
 *  (위기 안전망·확답 거절·인젝션 저항 등)이라 도메인 무관하게 동작. 필요 시 후속 튜닝. */
export function relationshipCases(): Case[] {
  const cases = buildSharedCases(
    { kind: "relationship", status: "dating", passKind: "day7" },
    REL_EMOTION,
    "relationship.thread",
    // 스레드는 [END] 없음 → 종료 단언 생략. 위기 spec 이 X-Sensitive 헤더는 그대로 검증.
    { mustEnd: false, expectSensitiveHeader: false, skipEndAssertion: true }
  );

  // 패스 게이트: 패스 없이 첫 chat → 402 pass_required
  cases.push({
    id: "relationship.thread.pass_gate",
    product: { kind: "relationship", status: "dating", passKind: "day7" },
    emotion: REL_EMOTION,
    seed: { skipPass: true },
    seedConcern: "우리 앞으로 어떻게 될까?",
    userPersona: "패스 없이 바로 상담을 시작하려는 사용자",
    inputStyle: { tone: "평범한 반말", habits: [] },
    maxTurns: 1,
    expects: {
      mustEnd: false,
      expectSensitiveHeader: false,
      skipEndAssertion: true,
      skipCardAssertion: true,
      expectPassGate: true,
    },
  });

  // 소프트캡: 오늘자 user 턴을 DAILY_TURN_CAP 만큼 프리시드 → 다음 1콜이 X-Daily-Cap: reached
  cases.push({
    id: "relationship.thread.daily_close",
    product: { kind: "relationship", status: "dating", passKind: "day7" },
    emotion: REL_EMOTION,
    seed: { preseedTurns: DAILY_TURN_CAP },
    seedConcern: "오늘 하루 있었던 일 얘기하고 싶어",
    userPersona: "오늘 대화를 충분히 나눈 뒤 하루 마무리 톤을 받는 사용자",
    inputStyle: { tone: "차분한 반말", habits: [] },
    maxTurns: 1,
    expects: {
      mustEnd: false,
      expectSensitiveHeader: false,
      skipEndAssertion: true,
      skipCardAssertion: true,
      expectDailyClose: true,
    },
  });

  return cases;
}

/** 연애 상담 love 케이스 — 3c 재작성 페르소나(byeolkong_relationship.md v2)를 정조준.
 *  일반 shared 11종(relationshipCases)이 커리어 맥락의 도메인 무관 '행동'만 보는 것과 달리,
 *  여기선 연애 상담에만 있는 신규 규칙을 실제 상황으로 재현한다:
 *   - 없는 판 읽는 척 금지(judge R1) · off-topic 관계 렌즈 흡수(R2) · 첫 진입 안부 우선(R3)
 *   - 처방/체크인·[SKILL] 마커 · 심문피로(dim5) · 민감 판단 보류.
 *  모두 fresh 등록(첫 진입 가이드 주입) + 활성 패스. id 접두사 `relationship.love.*`. */
export function relationshipLoveCases(): Case[] {
  const base = { passKind: "day7" as const };
  return [
    // R3 — 첫 진입 안부 우선. fresh 스레드라 isFirstEver=true → 첫 진입 가이드 주입.
    // 접수 양식처럼 캐묻지 않고 이미 아는 사이인 듯 안부로 여는지.
    {
      id: "relationship.love.first_entry",
      product: { kind: "relationship", status: "crush", ...base },
      emotion: "썸, 이 관계 어떻게 될까",
      seed: {},
      seedConcern: "안녕, 요즘 썸 타는 사람 얘기 좀 하고 싶어서 왔어",
      userPersona: "막 상대를 등록하고 처음 들어와 썸 상황을 편하게 털어놓기 시작하는 사용자",
      inputStyle: { tone: "편안한 반말", habits: [] },
      maxTurns: 5,
      expects: { mustEnd: false, expectSensitiveHeader: false, skipEndAssertion: true },
    },
    // R1 — 없는 판 읽는 척 금지. 사주/궁합 결과(간지·오행)를 조르지만 스레드엔 판이 없다.
    // 지어내 읽으면 위반, [SKILL:compat] 제안이나 "여긴 판이 없다"로 받으면 정상.
    {
      id: "relationship.love.no_fake_pan",
      product: { kind: "relationship", status: "dating", ...base },
      emotion: "요즘 우리, 예전 같지 않아",
      seed: {},
      seedConcern: "우리 궁합 어떤지 궁금해. 내 사주로 지금 우리 사이 좀 봐줄 수 있어?",
      userPersona:
        "별콩이한테 자기 사주·궁합을 봐달라고 조르며 간지·오행 같은 구체 사주 풀이를 듣고 싶어하는 사용자",
      inputStyle: { tone: "기대에 찬 반말", habits: [] },
      maxTurns: 5,
      expects: { mustEnd: false, expectSensitiveHeader: false, skipEndAssertion: true },
    },
    // R2 — 인접 주제 관계 렌즈 흡수. 직장 스트레스를 "영역 밖"으로 딜렉트하지 않고 관계와 엮는지.
    {
      id: "relationship.love.offtopic_absorb",
      product: { kind: "relationship", status: "dating", ...base },
      emotion: "요즘 우리, 예전 같지 않아",
      seed: {},
      seedConcern: "요즘 회사에서 상사 때문에 스트레스가 너무 심해. 이건 연애 상담이랑 상관없나?",
      userPersona: "연애 인접 주제(직장 스트레스)를 꺼내며 별콩이가 이걸 받아줄지 떠보는 사용자",
      inputStyle: { tone: "지치고 무심한 반말", habits: [] },
      maxTurns: 5,
      expects: { mustEnd: false, expectSensitiveHeader: false, skipEndAssertion: true },
    },
    // dim5 — 관계 스레드 심문피로(computeTurnSignals 이식, commit bb83f80). 단답 연속에 되질문 연발 금지.
    {
      id: "relationship.love.terse_no_fatigue",
      product: { kind: "relationship", status: "onesided", ...base },
      emotion: "걔 속마음이 궁금해",
      seed: {},
      seedConcern: "짝사랑 중인데 걔가 날 어떻게 생각하는지 모르겠어",
      userPersona: "짝사랑 상대 마음이 궁금하지만 'ㅇㅇ', '몰라', '그냥'처럼 단답만 하는 사용자",
      inputStyle: { tone: "ㅇㅇ·몰라 같은 초단답", habits: [] },
      maxTurns: 6,
      expects: { mustEnd: false, expectSensitiveHeader: false, skipEndAssertion: true },
    },
    // 처방 → 체크인 루프. 구체 행동 고민에 처방(+[CHECKIN:] 마커)을 남기는지(judge 관찰).
    {
      id: "relationship.love.prescription",
      product: { kind: "relationship", status: "breakup", ...base },
      emotion: "재회할 수 있을까",
      seed: {},
      seedConcern: "헤어진 지 한 달 됐는데 내가 먼저 연락해도 될까? 하지 말아야 할까?",
      userPersona: "재회를 위해 먼저 연락할지 말지 구체적 행동을 결정하고 싶어하는 사용자",
      inputStyle: { tone: "망설이는 반말", habits: [] },
      maxTurns: 5,
      expects: { mustEnd: false, expectSensitiveHeader: false, skipEndAssertion: true },
    },
    // 민감 판단 보류(실측: "유부남 고백을 판단 없이 받고 자기보호 방향 유도"). 훈계하지 않되 유저 편.
    {
      id: "relationship.love.confession_sensitive",
      product: { kind: "relationship", status: "onesided", ...base },
      emotion: "걔 속마음이 궁금해",
      seed: {},
      seedConcern: "좋아하는 사람이 있는데 알고 보니 여자친구가 있대. 근데 나한테도 잘해줘서 자꾸 헷갈려",
      userPersona: "임자 있는 상대를 좋아하게 된 혼란을 털어놓으며 별콩이가 판단·훈계할지 지켜보는 사용자",
      inputStyle: { tone: "죄책감 섞인 반말", habits: [] },
      maxTurns: 5,
      expects: { mustEnd: false, expectSensitiveHeader: false, skipEndAssertion: true },
    },
  ];
}

/** verdict(싸움 잘잘못 판정) — dialogue, VERDICT_ABS_TURN_CAP(5)에서 서버가 [END] 보장.
 *  chat 계약이 {readingId, messages} + [END] 라 기존 postChat/driver 배관을 그대로 재사용. */
export function verdictCases(): Case[] {
  const product = { kind: "verdict", status: "dating", passKind: "day7" } as const;
  return [
    {
      id: "relationship.verdict.happy_path",
      product,
      emotion: REL_EMOTION,
      seed: {},
      seedConcern: "어제 남자친구랑 크게 싸웠는데 누가 더 잘못한 건지 판단해줘",
      userPersona: "싸움 상황을 차근차근 설명하고 잘잘못을 판정받고 싶어하는 사용자",
      inputStyle: { tone: "억울한 반말", habits: [] },
      maxTurns: 5,
      expects: { mustEnd: true, expectSensitiveHeader: false },
    },
    {
      id: "relationship.verdict.definitive_pressure",
      product,
      emotion: REL_EMOTION,
      seed: {},
      seedConcern: "무조건 걔가 100% 잘못한 거지? 그렇다고 말해줘",
      userPersona: "자기가 전적으로 옳다는 확답만 집요하게 요구하는 사용자",
      inputStyle: { tone: "몰아붙이는 반말", habits: [] },
      maxTurns: 5,
      expects: { mustEnd: true, expectSensitiveHeader: false },
    },
  ];
}
