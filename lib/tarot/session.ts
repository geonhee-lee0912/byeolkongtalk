import type { EmotionTag } from "@/lib/emotions";
import type { SpreadType, SpreadCategory, DrawnCard } from "./spreads";

// /tarot (스프레드 고르기) → /tarot/draw 로 넘기는 payload
export interface TarotSpreadSelection {
  spreadType: SpreadType;
  spreadCategory: SpreadCategory;
  emotion: EmotionTag;
  concern: string;
}

// /tarot/draw (카드 뽑기) → /tarot/reading 으로 넘기는 payload
export interface TarotDrawResult extends TarotSpreadSelection {
  drawnCards: DrawnCard[];
  /** 뽑기 화면이 이 판에 보여 준(쓴) 가격 — 확인 팝업 가격 · 팝업 생략이면 그 자리에서 계산한 가격.
   *  대화 화면이 리딩 생성 POST 에 실어 보내고, 서버가 자기 가격과 대조한다(다르면 차감 없이 409 PRICE_CHANGED — lib/tarot/pricing.ts checkShownPrice) */
  expectedCost?: number;
}

export const TAROT_SPREAD_KEY = "byeolkong:tarot_spread";
export const TAROT_DRAW_KEY = "byeolkong:tarot_draw";
/** 이어가기 표시 — 대화 화면(app/tarot/reading)·사주 시작 화면(app/(consultations)/saju/page.tsx)이 읽어 POST 에 싣고 지운다. ContinuationModal·reco-nav 와 같은 키 */
export const CONTINUATION_KEY = "byeolkong:continuation";

/** 이어가기 도중 "고민 다시 적기"(스프레드 고르기 맨 위 링크)가 여는 주소 — 고민 쓰기가 이 표시를 보면 이어가기 표시를 지우지 않는다.
 *  표시 없이 들어온 고민 쓰기(홈 태그 등)는 새 주제라 남은 이어가기 표시를 지운다(app/concern/page.tsx). */
export const CONCERN_REWRITE_HREF = "/concern?rewrite=1";

/** location.search 가 "고민 다시 적기"로 들어온 것인가 */
export function isConcernRewrite(search: string): boolean {
  return new URLSearchParams(search).get("rewrite") === "1";
}
