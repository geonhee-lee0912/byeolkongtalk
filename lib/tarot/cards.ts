import tarotData from "@/data/tarot_card_data.json";

export interface TarotCard {
  id: number;
  name_en: string;
  name_kr: string;
  upright: string[];
  reversed: string[];
  visual: string;
  suit?: string;
}

/** 전체 78장 카드 배열 (id 0~77) */
function getAllCards(): TarotCard[] {
  const cards: TarotCard[] = [];

  // Major Arcana (0~21)
  for (const card of tarotData.major_arcana) {
    cards.push({
      id: card.id,
      name_en: card.name_en,
      name_kr: card.name_kr,
      upright: card.upright,
      reversed: card.reversed,
      visual: card.visual,
    });
  }

  // Minor Arcana (22~77)
  const suits = ["wands", "cups", "swords", "pentacles"] as const;
  let minorId = 22;
  for (const suit of suits) {
    const suitData = tarotData.minor_arcana[suit];
    for (const card of suitData.cards) {
      cards.push({
        id: minorId,
        name_en: `${card.id}`,
        name_kr: card.name_kr,
        upright: card.upright,
        reversed: card.reversed,
        visual: "",
        suit: suitData.suit_kr,
      });
      minorId++;
    }
  }

  return cards;
}

const ALL_CARDS = getAllCards();

export function getCard(id: number): TarotCard | undefined {
  return ALL_CARDS.find((c) => c.id === id);
}

export function getCardCount(): number {
  return ALL_CARDS.length;
}

export function shuffleDeck(): number[] {
  const ids = ALL_CARDS.map((c) => c.id);
  // Fisher-Yates shuffle
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

/**
 * 카드 이미지 경로 (public/cards-webp/ 기준)
 * RWS 덱: 00.webp ~ 77.webp (1024px WebP, 장당 ~150-400KB)
 */
export function getCardImagePath(cardId: number): string {
  return `/cards-webp/${String(cardId).padStart(2, "0")}.webp`;
}

export const CARD_BACK_IMAGE = "/cards-webp/back.webp";
