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
  // B-2: absTurnCap 에 그레이스풀 마무리용 +2 연장 예산 포함 (미해결 고민 시).
  one_card: {
    convergeStartTurn: 3,
    convergeStartChars: 1400,
    hardCapTurn: 5,
    hardCapChars: 1700,
    absTurnCap: 11,
  },
  two_card: {
    convergeStartTurn: 4,
    convergeStartChars: 1800,
    hardCapTurn: 6,
    hardCapChars: 2200,
    absTurnCap: 12,
  },
  three_card: {
    convergeStartTurn: 5,
    convergeStartChars: 2200,
    hardCapTurn: 7,
    hardCapChars: 2700,
    absTurnCap: 13,
  },
  relationship_5: {
    convergeStartTurn: 7,
    convergeStartChars: 3000,
    hardCapTurn: 9,
    hardCapChars: 3700,
    absTurnCap: 15,
  },
  // W1 신설 10종 — relationship_5 값을 카드 수 기준으로 스케일 (Task 3 임시 배치, 실측 후 조정 예정)
  // 5장: relationship_5와 동일
  deep_feelings_5: {
    convergeStartTurn: 7,
    convergeStartChars: 3000,
    hardCapTurn: 9,
    hardCapChars: 3700,
    absTurnCap: 15,
  },
  reunion_5: {
    convergeStartTurn: 7,
    convergeStartChars: 3000,
    hardCapTurn: 9,
    hardCapChars: 3700,
    absTurnCap: 15,
  },
  new_love_5: {
    convergeStartTurn: 7,
    convergeStartChars: 3000,
    hardCapTurn: 9,
    hardCapChars: 3700,
    absTurnCap: 15,
  },
  // 6장: relationship_5 +1턴/+300자
  checkin_6: {
    convergeStartTurn: 8,
    convergeStartChars: 3300,
    hardCapTurn: 10,
    hardCapChars: 4000,
    absTurnCap: 16,
  },
  stay_or_go_6: {
    convergeStartTurn: 8,
    convergeStartChars: 3300,
    hardCapTurn: 10,
    hardCapChars: 4000,
    absTurnCap: 16,
  },
  readiness_6: {
    convergeStartTurn: 8,
    convergeStartChars: 3300,
    hardCapTurn: 10,
    hardCapChars: 4000,
    absTurnCap: 16,
  },
  healing_6: {
    convergeStartTurn: 8,
    convergeStartChars: 3300,
    hardCapTurn: 10,
    hardCapChars: 4000,
    absTurnCap: 16,
  },
  // 7장: relationship_5 +2턴/+600자
  reunion_deep_7: {
    convergeStartTurn: 9,
    convergeStartChars: 3600,
    hardCapTurn: 11,
    hardCapChars: 4300,
    absTurnCap: 17,
  },
  potential_7: {
    convergeStartTurn: 9,
    convergeStartChars: 3600,
    hardCapTurn: 11,
    hardCapChars: 4300,
    absTurnCap: 17,
  },
  chakra_7: {
    convergeStartTurn: 9,
    convergeStartChars: 3600,
    hardCapTurn: 11,
    hardCapChars: 4300,
    absTurnCap: 17,
  },
};
