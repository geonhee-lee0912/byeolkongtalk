// lib/relationship/types.ts — "우리 사이" 공용 타입/상수 (단일 진실 원천)

export type RelationshipStatus = "crush" | "dating" | "breakup" | "onesided";

export const RELATIONSHIP_STATUS_LABELS: Record<RelationshipStatus, string> = {
  crush: "썸 타는 중",
  dating: "연애 중",
  breakup: "헤어진 사이",
  onesided: "짝사랑",
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

/** 스킬 프리뷰 카피 — S1 콜드스타트(/relationship)와 광고 랜딩(/start?v=relationship) 공유 */
export const RELATIONSHIP_SKILL_PREVIEWS = [
  { emoji: "💬", label: "관계 체크인", tagline: "두 사람의 상태와 서로의 필요를 나란히" },
  { emoji: "🔍", label: "걔 속마음", tagline: "겉모습 뒤의 진짜 속마음까지" },
  { emoji: "💞", label: "우리 궁합", tagline: "두 사람 사주로 보는 궁합" },
  { emoji: "⚖️", label: "싸움 잘잘못 판정", tagline: "양쪽 입장을 듣고 비율로 판정 + 화해 처방" },
] as const;

/** 오늘 연장 횟수 → 허용 턴 수. 상한 없음 — 연장 횟수는 무제한. */
export function dailyTurnAllowance(todayExtendCount: number): number {
  return DAILY_TURN_CAP + EXTEND_TURNS * Math.max(0, todayExtendCount);
}

export interface RelationshipMemo {
  prescriptions?: { text: string; created_at: string; resolved_at?: string }[];
  pending_checkin?: { text: string; created_at: string } | null;
  skill_log?: { skill: string; reading_id: string; summary: string; created_at: string }[];
}

/** 스킬 런처(useSkillLaunch, tarot_draw) → /tarot/draw 로 넘기는 sessionStorage marker. */
export interface RelSkillMarker {
  relationshipId: string;
  skillKey: string;
  spread: string;
}
export const REL_SKILL_KEY = "byeolkong:rel_skill";
