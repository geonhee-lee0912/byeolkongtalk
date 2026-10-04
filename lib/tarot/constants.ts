// 타로 풀이 [END] 수렴 임계치 — 스프레드별 분기 (카드 수 ↑ → 더 긴 대화 허용).
// 비용은 SPREAD_INFO[type].starCost 가 정본 (lib/tarot/spreads.ts).

import type { SpreadType } from "./spreads";

export interface WrapThresholds {
  /** 수렴 시작 turn (AND chars 도달 시 종합 톤) */
  convergeStartTurn: number;
  convergeStartChars: number;
  /** 자연 hardcap (turn + chars 둘 다 도달 시 [END]) */
  hardCapTurn: number;
  hardCapChars: number;
  /** 절대 turn cap (chars 미달이어도 이 turn 도달 시 [END]) */
  absTurnCap: number;
}

export const WRAP_THRESHOLDS: Record<SpreadType, WrapThresholds> = {
  // 2026-10-04 +3턴 개편 (spec 2026-10-04-타로톡-인챗결제-대화길이 §3-1):
  // convergeStart·자연 마무리선(hardCap) 을 전 스프레드 +3턴, 글자 임계 +1,440자(3턴×후속 480).
  // 강제 종료선(absTurnCap)은 불변 — B-2(06-28) 가 연 +2 연장 예산 포함값 그대로.
  // 실측 근거: 투카드 6번째 답에서 유저가 묻는 중에 닫힌 대화 7주 49건(05-30 도입값 6 이 원인).
  one_card: {
    convergeStartTurn: 6,
    convergeStartChars: 2840,
    hardCapTurn: 8,
    hardCapChars: 3140,
    absTurnCap: 11,
  },
  two_card: {
    convergeStartTurn: 7,
    convergeStartChars: 3240,
    hardCapTurn: 9,
    hardCapChars: 3640,
    absTurnCap: 12,
  },
  three_card: {
    convergeStartTurn: 9,
    convergeStartChars: 3640,
    hardCapTurn: 10,
    hardCapChars: 4140,
    absTurnCap: 13,
  },
  // 5장: 첫풀이 luna 실측 + (턴−1)×후속480 공식(2026-08-13) 위에 +3턴
  relationship_5: {
    convergeStartTurn: 12,
    convergeStartChars: 8640,
    hardCapTurn: 13,
    hardCapChars: 9140,
    absTurnCap: 15,
  },
  deep_feelings_5: {
    convergeStartTurn: 12,
    convergeStartChars: 8640,
    hardCapTurn: 13,
    hardCapChars: 9140,
    absTurnCap: 15,
  },
  reunion_5: {
    convergeStartTurn: 12,
    convergeStartChars: 8640,
    hardCapTurn: 13,
    hardCapChars: 9140,
    absTurnCap: 15,
  },
  new_love_5: {
    convergeStartTurn: 12,
    convergeStartChars: 8640,
    hardCapTurn: 13,
    hardCapChars: 9140,
    absTurnCap: 15,
  },
  // 6장: relationship_5 +1턴/+300자 (상대 관계 유지)
  checkin_6: {
    convergeStartTurn: 14,
    convergeStartChars: 10140,
    hardCapTurn: 15,
    hardCapChars: 10540,
    absTurnCap: 17,
  },
  stay_or_go_6: {
    convergeStartTurn: 14,
    convergeStartChars: 10140,
    hardCapTurn: 15,
    hardCapChars: 10540,
    absTurnCap: 17,
  },
  readiness_6: {
    convergeStartTurn: 14,
    convergeStartChars: 10140,
    hardCapTurn: 15,
    hardCapChars: 10540,
    absTurnCap: 17,
  },
  healing_6: {
    convergeStartTurn: 14,
    convergeStartChars: 10140,
    hardCapTurn: 15,
    hardCapChars: 10540,
    absTurnCap: 17,
  },
  // 7장: relationship_5 +2턴/+600자 (상대 관계 유지)
  reunion_deep_7: {
    convergeStartTurn: 16,
    convergeStartChars: 11540,
    hardCapTurn: 17,
    hardCapChars: 12040,
    absTurnCap: 19,
  },
  potential_7: {
    convergeStartTurn: 16,
    convergeStartChars: 11540,
    hardCapTurn: 17,
    hardCapChars: 12040,
    absTurnCap: 19,
  },
  chakra_7: {
    convergeStartTurn: 16,
    convergeStartChars: 11540,
    hardCapTurn: 17,
    hardCapChars: 12040,
    absTurnCap: 19,
  },
};
