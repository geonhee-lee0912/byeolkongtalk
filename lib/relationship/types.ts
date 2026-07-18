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

/** 패스 상품 — 서버 권위(클라가 보낸 cost 신뢰 X). 스펙 §6: 1일20/3일40/7일60. */
export const PASS_PLANS: PassPlan[] = [
  { kind: "day1", days: 1, cost: 20, label: "1일권" },
  { kind: "day3", days: 3, cost: 40, label: "3일권" },
  { kind: "day7", days: 7, cost: 60, label: "7일권" },
];

export const PASS_PLAN_BY_KIND: Record<PassKind, PassPlan> = Object.fromEntries(
  PASS_PLANS.map((p) => [p.kind, p])
) as Record<PassKind, PassPlan>;

/** 일일 자유대화 소프트캡 + 연장(결정: 5별 → +5턴, 반복 가능) */
export const DAILY_TURN_CAP = 20;
export const EXTEND_COST = 5;
export const EXTEND_TURNS = 5;

/** 오늘 연장 횟수 → 허용 턴 수 */
export function dailyTurnAllowance(todayExtendCount: number): number {
  return DAILY_TURN_CAP + EXTEND_TURNS * Math.max(0, todayExtendCount);
}

export interface RelationshipMemo {
  prescriptions?: { text: string; created_at: string; resolved_at?: string }[];
  pending_checkin?: { text: string; created_at: string } | null;
  skill_log?: { skill: string; reading_id: string; summary: string; created_at: string }[];
}
