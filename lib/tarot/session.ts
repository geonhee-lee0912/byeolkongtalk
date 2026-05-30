import type { EmotionTag } from "@/lib/emotions";
import type { SpreadType, SpreadCategory, DrawnCard } from "./spreads";

// /tarot (스프레드 선택) → /tarot/draw 로 넘기는 payload
export interface TarotSpreadSelection {
  spreadType: SpreadType;
  spreadCategory: SpreadCategory;
  emotion: EmotionTag;
  concern: string;
}

// /tarot/draw (카드 뽑기) → /tarot/reading 으로 넘기는 payload
export interface TarotDrawResult extends TarotSpreadSelection {
  drawnCards: DrawnCard[];
}

export const TAROT_SPREAD_KEY = "byeolkong:tarot_spread";
export const TAROT_DRAW_KEY = "byeolkong:tarot_draw";
