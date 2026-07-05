// lib/analytics/aggregate.ts — 조회한 행을 받아 집계하는 순수 함수들.
import { fortuneTypeFromTag } from "@/lib/fortune/types";

export type ReadingRow = {
  user_id: string;
  consultation_type: "saju" | "tarot";
  emotion_tag: string | null;
  saju_product: string | null;
  stars_spent: number | null;
  created_at: string;
};

export type PaymentRow = {
  user_id: string;
  amount_won: number | null;
  package_type: string | null;
  status: string | null;
  created_at: string;
};

export type CounselGroup = {
  emotionTag: string;
  consultationType: "saju" | "tarot";
  count: number;
  paidCount: number;
  starsSpent: number;
};
export type FortuneGroup = {
  kind: string;
  count: number;
  paidCount: number;
  starsSpent: number;
};
export type PackageGroup = {
  packageType: string;
  count: number;
  revenueWon: number;
};
export type ProductBreakdown = {
  counsel: CounselGroup[];
  fortune: FortuneGroup[];
  packages: PackageGroup[];
};

export function buildProductBreakdown(
  readings: ReadingRow[],
  payments: PaymentRow[]
): ProductBreakdown {
  const counsel = new Map<string, CounselGroup>();
  const fortune = new Map<string, FortuneGroup>();

  for (const r of readings) {
    const paid = (r.stars_spent ?? 0) > 0;
    const stars = r.stars_spent ?? 0;
    const kind = fortuneTypeFromTag(r.emotion_tag);
    if (kind) {
      const g =
        fortune.get(kind) ?? { kind, count: 0, paidCount: 0, starsSpent: 0 };
      g.count += 1;
      if (paid) g.paidCount += 1;
      g.starsSpent += stars;
      fortune.set(kind, g);
    } else {
      const tag = r.emotion_tag ?? "(없음)";
      const key = `${r.consultation_type}|${tag}`;
      const g =
        counsel.get(key) ?? {
          emotionTag: tag,
          consultationType: r.consultation_type,
          count: 0,
          paidCount: 0,
          starsSpent: 0,
        };
      g.count += 1;
      if (paid) g.paidCount += 1;
      g.starsSpent += stars;
      counsel.set(key, g);
    }
  }

  const packages = new Map<string, PackageGroup>();
  for (const p of payments) {
    if (p.status !== "completed") continue;
    const key = p.package_type ?? "(없음)";
    const g =
      packages.get(key) ?? { packageType: key, count: 0, revenueWon: 0 };
    g.count += 1;
    g.revenueWon += p.amount_won ?? 0;
    packages.set(key, g);
  }

  const byCountDesc = <T extends { count: number }>(a: T, b: T) =>
    b.count - a.count;
  return {
    counsel: [...counsel.values()].sort(byCountDesc),
    fortune: [...fortune.values()].sort(byCountDesc),
    packages: [...packages.values()].sort((a, b) => b.revenueWon - a.revenueWon),
  };
}
