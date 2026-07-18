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
