// 메뉴판 → 카드 뽑기 sessionStorage 저장 (키 계약의 정본은 lib/tarot/session.ts · lib/emotions.ts).
// 저장소를 인자로 받는다 — 유닛 테스트에서 가짜 저장소로 돌리기 위해서다. 화면에선 sessionStorage 를 넘긴다.
import { PENDING_KEY, type PendingConsultation } from "../emotions.ts";
import { EMOTION_TO_CATEGORY } from "./spreads.ts";
import { CONTINUATION_KEY, TAROT_SPREAD_KEY, type TarotSpreadSelection } from "./session.ts";
import type { MenuProduct } from "./menu.ts";

type Store = Pick<Storage, "setItem">;

/** 메뉴판에서 고른 상품 → /tarot/draw 가 읽는 선택값(가격 동의 포함). */
export function menuSelection(p: MenuProduct, concern: string): TarotSpreadSelection {
  return {
    spreadType: p.spreadType,
    spreadCategory: EMOTION_TO_CATEGORY[p.tag],
    emotion: p.tag,
    concern,
    consented: true,
  };
}

export function saveMenuSelection(store: Store, p: MenuProduct, concern: string): void {
  store.setItem(TAROT_SPREAD_KEY, JSON.stringify(menuSelection(p, concern)));
}

/**
 * 맛보기 끝 "이어서 깊게" — 기존 tarot-fresh 이어가기 계약 그대로 + 깊게 상품 선택(동의). 호출부가 /tarot/draw 로 보낸다.
 * 가격은 정가 — 서버가 그룹 가격(tarotPrice)으로 받고, 부모 소유·비민감·[END] 를 검증한다(app/api/consultations/tarot).
 */
export function saveDeepContinuation(
  store: Store,
  o: { parentReadingId: string; deep: MenuProduct; concern: string }
): void {
  const pending: PendingConsultation = { emotion: o.deep.tag, concern: o.concern, type: "tarot" };
  store.setItem(PENDING_KEY, JSON.stringify(pending));
  saveMenuSelection(store, o.deep, o.concern);
  // 이어가기 표시는 마지막에 — 앞 쓰기가 던지면(저장소 가득 참·차단) 부모 연결만 남아 다음 새 리딩에 붙는 일이 없게
  store.setItem(CONTINUATION_KEY, JSON.stringify({ previousReadingId: o.parentReadingId, mode: "fresh" }));
}

/**
 * 동의는 한 판에 한 번만 — 카드 뽑기가 이 판을 시작할 때(goToReading — 팝업 생략·팝업 확인 둘 다) 부른다.
 * 안 지우면 대화 화면에서 뒤로 가 다시 뽑을 때 확인 팝업 없이 같은 금액이 또 빠진다(Task 4 리뷰).
 * 잔액 부족 → 충전 → 뽑기로 돌아오는 경로에선 부르지 않는다(동의를 쓰지 않았으니 그대로 이어지게).
 * 새로 저장한 선택값(consented:false)을 돌려준다 — 호출부가 화면 state 도 맞춘다: setSelection(spendConsent(sessionStorage, selection)).
 */
export function spendConsent(store: Store, selection: TarotSpreadSelection): TarotSpreadSelection {
  const spent = { ...selection, consented: false };
  store.setItem(TAROT_SPREAD_KEY, JSON.stringify(spent));
  return spent;
}
