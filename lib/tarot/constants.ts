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
  one_card: {
    convergeStartTurn: 3,
    convergeStartChars: 1400,
    hardCapTurn: 5,
    hardCapChars: 1700,
    absTurnCap: 9,
  },
  two_card: {
    convergeStartTurn: 4,
    convergeStartChars: 1800,
    hardCapTurn: 6,
    hardCapChars: 2200,
    absTurnCap: 10,
  },
  three_card: {
    convergeStartTurn: 5,
    convergeStartChars: 2200,
    hardCapTurn: 7,
    hardCapChars: 2700,
    absTurnCap: 11,
  },
  relationship_5: {
    convergeStartTurn: 7,
    convergeStartChars: 3000,
    hardCapTurn: 9,
    hardCapChars: 3700,
    absTurnCap: 13,
  },
};
