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
