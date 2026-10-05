// 잔액 맞춤 충전 기본값 — 충전 시트(RechargeSheet)·/shop 공용 규칙.
// 결제는 거의 전부 "하려는 것 − 잔액" 을 덮는 최소 패키지다(2026-10-05 실측, 179건 중 star_10 의 86% 가 부족분 ≤10).
// 기본값은 그 최소 패키지의 한 단계 위(star_70 상한, 단 최소보다 작아지지 않음). star_10 은 숨기지 않는다.
// 스펙: docs/superpowers/specs/2026-10-05-잔액맞춤-충전기본값-design.md
import { FIRST_CHARGE_BONUS_RATE, type StarPackage } from "./constants.ts";

/** 기본 선택 상한 — 이보다 크게 기본으로 고르지 않는다(못 덮을 때 제외). */
const DEFAULT_CAP_ID = "star_70";

/** 결제하면 실제로 받는 별. 보너스 반올림은 화면 표시(RechargeSheet·/shop)와 같은 Math.round. */
export function receivedStars(pkg: StarPackage, bonusEligible: boolean): number {
  return pkg.stars + (bonusEligible ? Math.round(pkg.stars * FIRST_CHARGE_BONUS_RATE) : 0);
}

/**
 * 기본 선택 패키지 id. null = 모름/부족 아님 → 화면의 기존 기본값을 쓴다.
 * min = 부족분을 덮는 가장 작은 패키지 · 기본 = min 한 단계 위, star_70 상한, min 미만 금지.
 * 어느 것도 못 덮으면 목록의 가장 큰 패키지.
 */
export function pickDefaultPackage(input: {
  need: number | null;
  balance: number | null;
  bonusEligible: boolean;
  packages: StarPackage[];
}): string | null {
  const { need, balance, bonusEligible, packages } = input;
  if (need == null || balance == null || packages.length === 0) return null;
  const shortfall = need - balance;
  if (shortfall <= 0) return null;

  const sorted = [...packages].sort((a, b) => a.stars - b.stars);
  const minIdx = sorted.findIndex((p) => receivedStars(p, bonusEligible) >= shortfall);
  if (minIdx === -1) return sorted[sorted.length - 1].id;

  let idx = Math.min(minIdx + 1, sorted.length - 1);
  const capIdx = sorted.findIndex((p) => p.id === DEFAULT_CAP_ID);
  if (capIdx !== -1) idx = Math.min(idx, capIdx);
  idx = Math.max(idx, minIdx);
  return sorted[idx].id;
}

/** 이 패키지로 충전하고 이번 것을 산 뒤 남는 별(음수 = 그만큼 모자람). */
export function leftoverAfter(input: {
  need: number;
  balance: number;
  pkg: StarPackage;
  bonusEligible: boolean;
}): number {
  return input.balance + receivedStars(input.pkg, input.bonusEligible) - input.need;
}

/** /shop `?need=` 파싱 — 1~1000 정수만. 그 외는 null(규칙 미적용). */
export function parseNeedParam(raw: string | null): number | null {
  if (raw == null || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= 1000 ? n : null;
}

/** 첫 충전 보너스 퍼센트(표시용). 문구에 숫자를 박지 말고 이걸 쓴다. */
export function firstChargeBonusPercent(): number {
  return Math.round(FIRST_CHARGE_BONUS_RATE * 100);
}
