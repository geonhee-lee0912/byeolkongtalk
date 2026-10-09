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

/** 화면이 본 가격과 서버 가격 대조 — 배포 순간의 낡은 번들이 옛 가격을 보여 주고 새 가격이 빠지는 걸 막는다.
 *  expected 가 숫자면 그 값이어야 한다. 없으면(이 필드를 모르는 옛 번들) 옛 번들이 보여 줬을 값(legacyShown)과 서버 가격이 같을 때만 통과.
 *  - expected = 클라가 보낸 expectedCost(뽑기 화면 → 대화 화면이 싣는다 · 이어가기 팝업). 0 이상 정수만 값으로 친다 — 그 밖(문자열·소수·음수)은 없는 것.
 *  - legacyShown = 배포 전 화면이 보여 줬을 값 = 같은 계산을 옛 그룹으로(tarotPrice(spread,"legacy") · 이어가기는 continuationPrice(fullCostFor(…legacy))).
 *    옛 그룹 유저와 두 그룹 가격이 같은 상품(투카드·3장)은 필드 없이도 그대로 통과한다 — QA 스크립트(기본 유저 = 옛 그룹)도 그렇다.
 *  호출: app/api/consultations/tarot(새 리딩·tarot-fresh) · app/api/readings/continue(타로 부모 deep). "changed" 면 차감·리딩 생성 전에 409 price_changed.
 *  ⚠️ 동의 생략(메뉴판 → 뽑기, 팝업 없음)의 expectedCost 는 뽑기 화면 번들이 그 자리에서 계산한 값이지 메뉴판이 보여 준 값이 아니다 —
 *     메뉴판 가격을 올리는 배포가 동의와 뽑기 사이에 끼고 뽑기가 새 번들로 뜨면(새로고침 등) 새 가격이 팝업 없이 통과한다.
 *     그래서 플랜 '알고 가는 것'의 consentedCost(동의 때 본 가격 저장)는 이 대조로 대신되지 않는다 — 메뉴판 가격을 올리기 전엔 여전히 필요하다. */
export function checkShownPrice(o: { expected: unknown; actual: number; legacyShown: number }): "ok" | "changed" {
  const shown =
    typeof o.expected === "number" && Number.isInteger(o.expected) && o.expected >= 0 ? o.expected : o.legacyShown;
  return shown === o.actual ? "ok" : "changed";
}
