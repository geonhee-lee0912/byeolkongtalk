// lib/relationship/types.ts — "우리 사이" 공용 타입/상수 (단일 진실 원천)

export type RelationshipStatus = "crush" | "dating" | "breakup" | "onesided";

export const RELATIONSHIP_STATUS_LABELS: Record<RelationshipStatus, string> = {
  crush: "썸 타는 중",
  dating: "연애 중",
  breakup: "헤어진 사이",
  onesided: "짝사랑",
};

/** 관계 상태별 인형 아바타 색(스펙 §P2). CSS 그라데이션용 [밝은, 진한]. */
export const DOLL_COLORS: Record<RelationshipStatus, [string, string]> = {
  crush: ["#F7C6D9", "#EFA9C2"], // 썸 분홍
  dating: ["#F4A6A6", "#E87C7C"], // 연인 빨강
  onesided: ["#D9C6F7", "#B8A9EF"], // 짝사랑 보라
  breakup: ["#D4D0DB", "#B3AEC0"], // 이별 회색
};

export type PassKind = "day1" | "day3" | "day7";

export interface PassPlan {
  kind: PassKind;
  days: number;
  cost: number;
  label: string;
  recommended?: boolean;
}

/** 패스 상품 — 서버 권위(클라가 보낸 cost 신뢰 X). 가격 조정(2026-07-20): 1일30/3일60/7일100 (C2안, 7일=star_70+star_30 정합). */
export const PASS_PLANS: PassPlan[] = [
  { kind: "day1", days: 1, cost: 30, label: "24시간(1일)" },
  { kind: "day3", days: 3, cost: 60, label: "72시간(3일)" },
  { kind: "day7", days: 7, cost: 100, label: "168시간(7일)" },
];

export const PASS_PLAN_BY_KIND: Record<PassKind, PassPlan> = Object.fromEntries(
  PASS_PLANS.map((p) => [p.kind, p])
) as Record<PassKind, PassPlan>;

/** 일일 자유대화 소프트캡 + 연장(결정: 5별 → +5턴, 횟수 제한 없이 반복) */
export const DAILY_TURN_CAP = 20;
export const EXTEND_COST = 5;
export const EXTEND_TURNS = 5;

/** 패스 없이 열리는 무료 첫 대화 — 스레드 누적 유저 발화 기준 (서버 권위: messages 카운트).
 * 근거: 2026-07-25 P&L — 등록 15 중 14 무발화, 그중 5명이 현금 결제자 = 지불 의사가 아니라 순서 문제. */
export const FREE_INTRO_TURNS = 3;

/** 시뮬레이션 한 판 고정가 — 연습 + 💭 코칭 + 자동 노트 + 디브리핑 + 보낼 말 전부 포함(스펙 §7).
 * 🔴 WELCOME_BONUS_STARS(20)가 첫 판을 흡수하도록 X<20 (스펙 §7·§11). 서버 권위(클라 cost 신뢰 X).
 * 값은 튜닝 대상(배포 후 구매 비율 관측) — 코드 상수가 정본. */
export const SIM_COST = 15;

/** 답변 추천 1회 비용 — 판 안에서 반복 구매하는 소액 아이템(유저 결정 2026-08-08).
 * 별콩이가 유저가 지금 인형에게 할 만한 말 3가지를 제안. 서버 권위(클라 cost 신뢰 X). 값은 튜닝 대상. */
export const SIM_SUGGEST_COST = 5;

/** 시뮬 한 판의 인형 대화 절대 상한(원가 경계, 스펙 §2 "abs-cap 재사용"). 도달 시 서버가 디브리핑을 강제(추가 인형 턴 거부).
 * 단 has_sensitive 판은 강제하지 않음(안전>원가, 스펙 §5) — chat 라우트가 simForceDebrief 로 억제. */
export const SIM_TURN_CAP = 12;

/** 스킬 프리뷰 카피 — S1 콜드스타트(/relationship)와 광고 랜딩(/start?v=relationship) 공유 */
export const RELATIONSHIP_SKILL_PREVIEWS = [
  { emoji: "💬", label: "관계 체크인", tagline: "두 사람의 상태와 서로의 필요를 나란히" },
  { emoji: "🔍", label: "걔 속마음", tagline: "겉모습 뒤의 진짜 속마음까지" },
  { emoji: "💞", label: "우리 궁합", tagline: "두 사람 사주로 보는 궁합" },
  { emoji: "⚖️", label: "싸움 잘잘못 판정", tagline: "양쪽 입장을 듣고 비율로 판정 + 화해 처방" },
] as const;

/** MBTI 16 + 건너뛰기. 드롭다운 옵션(서버는 4글자 문자열 저장). */
export const MBTI_OPTIONS = [
  "ISTJ", "ISFJ", "INFJ", "INTJ", "ISTP", "ISFP", "INFP", "INTP",
  "ESTP", "ESFP", "ENFP", "ENTP", "ESTJ", "ESFJ", "ENFJ", "ENTJ",
] as const;
export type Mbti = (typeof MBTI_OPTIONS)[number];

/** 오늘 연장 횟수 → 허용 턴 수. 상한 없음 — 연장 횟수는 무제한. */
export function dailyTurnAllowance(todayExtendCount: number): number {
  return DAILY_TURN_CAP + EXTEND_TURNS * Math.max(0, todayExtendCount);
}

export interface RelationshipMemo {
  prescriptions?: { text: string; created_at: string; resolved_at?: string }[];
  pending_checkin?: { text: string; created_at: string } | null;
  skill_log?: { skill: string; reading_id: string; summary: string; created_at: string }[];
  /** 카드뽑기 스킬 직후의 캡 면제 잔여 턴(구매한 대화 분량). 소진되면 null. 만료 없음. */
  skill_grace?: { key: string; remaining: number } | null;
  /** 진행 중 인-스레드 스킬(Phase 1: 판정). 없으면 일반 대화.
   *  assistant_turns = 스킬 개시 후 별콩이 응답 턴 수(안전 턴캡용). */
  active_skill?: { key: string; started_at: string; assistant_turns: number } | null;
}

/** 관계 슬롯 — 첫 사람부터 슬롯 구매(2026-08-05 사용자 결정, 무료 첫 사람 폐지).
 * 허용 관계 수 = 구매한 슬롯 수. SLOT_COST 는 서버 권위(클라가 보낸 값 신뢰 X). 값은 튜닝 대상(스펙 §11).
 * ⚠️ WELCOME_BONUS_STARS(20) < SLOT_COST(50) 라 신규 유저는 첫 등록에 충전 필요 — 의도된 페이월. */
export const SLOT_COST = 50;

export function slotAllowance(purchasedSlots: number): number {
  return Math.max(0, purchasedSlots);
}
