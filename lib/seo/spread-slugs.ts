// lib/seo/spread-slugs.ts — SpreadType ↔ SEO 슬러그 (순수)
import { SPREAD_INFO, type SpreadType } from "@/lib/tarot/spreads";

export function buildSpreadSlug(type: SpreadType): string {
  return type.replace(/_/g, "-");
}

const SLUG_TO_SPREAD = new Map(
  (Object.keys(SPREAD_INFO) as SpreadType[]).map((t) => [buildSpreadSlug(t), t])
);

export function findSpreadBySlug(slug: string): SpreadType | undefined {
  return SLUG_TO_SPREAD.get(slug);
}

export function getAllSpreadSlugs(): string[] {
  return [...SLUG_TO_SPREAD.keys()];
}
