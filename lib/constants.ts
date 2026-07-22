// 공용 상수 — 별 패키지 등. v1 (tarot-friend) lib/types.ts 에서 결제 관련만 이식.

export interface StarPackage {
  id: string;
  stars: number;
  price: number;
  label: string;
}

export const STAR_PACKAGES: StarPackage[] = [
  { id: "star_10", stars: 10, price: 1000, label: "10별" },
  { id: "star_30", stars: 30, price: 2800, label: "30별" },
  { id: "star_70", stars: 70, price: 5900, label: "70별" },
  { id: "star_150", stars: 150, price: 11000, label: "150별" },
  { id: "star_300", stars: 300, price: 19900, label: "300별" },
];

/** 카카오 신규 가입 웰컴 별 — 타로 원/투(10/15)·이번달(20) 1회 커버. 2026-07-22 30→20:
 * 결제 66%가 star_10 갭결제(재구매 8%)라 갭을 20으로 벌려 star_30(₩2,800) 첫 결제 유도.
 * 근거·판정 기준: docs/superpowers/specs/2026-07-22-welcome-stars-reduction-design.md */
export const WELCOME_BONUS_STARS = 20;
/** 첫 충전 보너스 비율 — 첫 결제 패키지 별의 +20% (반올림). 2026-07-20 마진·재결제 유도로 50%→20% */
export const FIRST_CHARGE_BONUS_RATE = 0.2;
