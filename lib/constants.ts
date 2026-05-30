// 공용 상수 — 별 패키지 등. v1 (tarot-friend) lib/types.ts 에서 결제 관련만 이식.

export interface StarPackage {
  id: string;
  stars: number;
  price: number;
  label: string;
}

export const STAR_PACKAGES: StarPackage[] = [
  { id: "star_10", stars: 10, price: 1000, label: "10별" },
  { id: "star_35", stars: 35, price: 2900, label: "35별" },
  { id: "star_80", stars: 80, price: 5900, label: "80별" },
  { id: "star_150", stars: 150, price: 9900, label: "150별" },
  { id: "star_230", stars: 230, price: 12900, label: "230별" },
];
