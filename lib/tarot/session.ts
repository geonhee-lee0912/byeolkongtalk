import type { EmotionTag } from "@/lib/emotions";
import type { SpreadType, SpreadCategory, DrawnCard } from "./spreads";

// /tarot (메뉴판 또는 옛 스프레드 고르기) → /tarot/draw 로 넘기는 payload
export interface TarotSpreadSelection {
  spreadType: SpreadType;
  spreadCategory: SpreadCategory;
  emotion: EmotionTag;
  concern: string;
  /** 메뉴판에서 가격을 보고 고른 선택(맛보기 탭·비교 창 '이걸로 볼래'·맛보기 끝 이어서 깊게) — 메뉴판 그룹만 심는다.
   *  카드 뽑기는 잔액이 충분하면 확인 팝업 없이 바로 대화로 보낸다 — 모자라면 지금처럼 뽑은 뒤 잔액 부족 팝업.
   *  스펙 2026-10-05-타로톡-메뉴판-별경제 §4 */
  consented?: boolean;
}

// /tarot/draw (카드 뽑기) → /tarot/reading 으로 넘기는 payload
export interface TarotDrawResult extends TarotSpreadSelection {
  drawnCards: DrawnCard[];
}

export const TAROT_SPREAD_KEY = "byeolkong:tarot_spread";
export const TAROT_DRAW_KEY = "byeolkong:tarot_draw";
/** 이어가기 표시 — 대화 화면(app/tarot/reading)이 읽어 POST 에 싣고 지운다. ContinuationModal·reco-nav 와 같은 키 */
export const CONTINUATION_KEY = "byeolkong:continuation";
