// Phase 5 (c) 사주 풀이 가격 + [END] 수렴 임계치.
// 단일 정책 — 사주는 v1 타로처럼 스프레드 분기 없음.

export const SAJU_READING_COST = 20;

// 수렴 시작 (이 턴 + chars AND 조건 도달 시 종합 톤 진입)
export const CONVERGE_START_TURN = 4;
export const CONVERGE_START_CHARS = 1800;

// 자연 hardcap (turn + chars 둘 다 도달 시 [END])
export const HARD_CAP_TURN = 6;
export const HARD_CAP_CHARS = 2200;

// 절대 turn cap (chars 미달이어도 이 turn 도달 시 [END] — 짧은 핑퐁 안전망)
export const ABS_TURN_CAP = 9;
