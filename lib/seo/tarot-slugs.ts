// lib/seo/tarot-slugs.ts — 카드 id ↔ SEO 슬러그 (순수, 클라이언트 안전)
import { getAllTarotCards, type TarotCard } from "@/lib/tarot/cards";

const SUIT_EN: Record<string, string> = {
  W: "wands",
  C: "cups",
  S: "swords",
  P: "pentacles",
};

// 마이너 랭크 코드 → 영문 랭크명. 숫자 카드는 "01"~"10", 코트 카드는 문자 1개
// (P=page, N=knight, Q=queen, K=king) — data/tarot_card_data.json 의 실제 id 표기.
const RANK_EN: Record<string, string> = {
  "01": "ace", "02": "two", "03": "three", "04": "four", "05": "five",
  "06": "six", "07": "seven", "08": "eight", "09": "nine", "10": "ten",
  P: "page", N: "knight", Q: "queen", K: "king",
};

export function buildCardSlug(card: TarotCard): string {
  const m = card.name_en.match(/^([WCSP])(\d{2}|[PNQK])$/);
  if (m) return `${SUIT_EN[m[1]]}-${RANK_EN[m[2]]}`;
  return card.name_en
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const SLUG_TO_CARD = new Map(
  getAllTarotCards().map((c) => [buildCardSlug(c), c])
);

export function findCardBySlug(slug: string): TarotCard | undefined {
  return SLUG_TO_CARD.get(slug);
}

export function getAllCardSlugs(): string[] {
  return [...SLUG_TO_CARD.keys()];
}
