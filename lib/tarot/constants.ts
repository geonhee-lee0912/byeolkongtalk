// 타로 풀이 [END] 수렴 임계치 — 스프레드별 분기 (카드 수 ↑ → 더 긴 대화 허용).
// 비용은 lib/tarot/pricing.ts 의 tarotPrice(spread) 가 정본 (SPREAD_INFO.starCost).

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
  // 2026-10-25 원·투카드만 되돌림 (spec 2026-10-25-타로-원투카드-마무리-안내줄 §2-2, 사용자 결정): 자연 마무리선 원 5·투 6번째 답,
  // 정리 말투는 그 한 턴 전부터만(3장+ 와 같은 간격 — '한 장 더' 제안이 나오는 자유 구간을 덜 줄이려고), 글자 임계는 10-04 이전 값.
  // 묻는 중에 닫히던 문제(위 49건)는 keep-open(spec 2026-10-04 §3-3)이 막는다. 강제 종료선 불변.
  one_card: {
    convergeStartTurn: 4,
    convergeStartChars: 1400,
    hardCapTurn: 5,
    hardCapChars: 1700,
    absTurnCap: 11,
  },
  two_card: {
    convergeStartTurn: 5,
    convergeStartChars: 1800,
    hardCapTurn: 6,
    hardCapChars: 2200,
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
  // 6장: 5장보다 긴 대화 허용 (2026-08-13 spec 타로톡-분량-턴구조-재설계 기준값 + 2026-10-04 +3턴)
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
  // 7장: 6장보다 긴 대화 허용 (2026-08-13 spec 타로톡-분량-턴구조-재설계 기준값 + 2026-10-04 +3턴)
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
