// Phase 5 (c) 사주 풀이 가격 + [END] 수렴 임계치.
// 단일 정책 — 사주는 v1 타로처럼 스프레드 분기 없음.

export const SAJU_READING_COST = 20;

// 수렴 시작 (이 턴 + chars AND 조건 도달 시 종합 톤 진입)
// 20별 가격에 맞춰 타로 투카드(15)~쓰리카드(25) 중간으로 상향.
export const CONVERGE_START_TURN = 5;
export const CONVERGE_START_CHARS = 2000;

// 자연 hardcap (turn + chars 둘 다 도달 시 [END])
export const HARD_CAP_TURN = 7;
export const HARD_CAP_CHARS = 2500;

// 절대 turn cap (chars 미달이어도 이 turn 도달 시 [END] — 짧은 핑퐁 안전망).
// B-2: 미해결 고민 시 그레이스풀하게 마무리할 연장 예산 포함.
export const ABS_TURN_CAP = 12;
