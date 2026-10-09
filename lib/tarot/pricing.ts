// 타로 상품 가격 — 반반 비교 그룹을 받는 가격 함수 하나. 서버 차감·이어가기 가격·화면 표시가 모두 이것을 쓴다.
// 옛 그룹 = SPREAD_INFO.starCost(지금 prod 그대로) · 메뉴판 그룹 = 카드 수 사다리.
// 스펙 §3-2 · §9-1. 🗓️ 판정 뒤 정리 배포에서 이긴 쪽 값 하나로 접는다.
import { SPREAD_INFO, type SpreadType } from "./spreads.ts";
import type { MenuArm } from "./menu-ab.ts";

/** 메뉴판 그룹 가격(카드 수별) — 맛보기 15 · 투카드 15 · 3장 25 · 깊게(5·6장) 55 · 끝까지(7장) 70 */
const MENU_PRICE_BY_CARDS: Record<number, number> = { 1: 15, 2: 15, 3: 25, 5: 55, 6: 55, 7: 70 };

export function tarotPrice(spread: SpreadType, arm: MenuArm): number {
  const info = SPREAD_INFO[spread];
  return arm === "menu" ? MENU_PRICE_BY_CARDS[info.cardCount] : info.starCost;
}
