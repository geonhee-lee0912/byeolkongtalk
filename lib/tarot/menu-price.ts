// 메뉴판 가격 표시·비교 수치 — 순수 함수(클라 안전). 스펙 2026-10-05-타로톡-메뉴판-별경제 §5-2·§5-3 · §9-1.
// 메뉴판 그룹 화면 전용 — 표시만 한다(차감은 서버가 tarotPrice 로, 모자라면 402).
import type { Wallet } from "../wallet.ts";
import { SPREAD_INFO } from "./spreads.ts";
import { WRAP_THRESHOLDS } from "./constants.ts";
import { tarotPrice } from "./pricing.ts";
import { productPositions, productPrice, type MenuProduct } from "./menu.ts";

/** 맛보기를 가입 선물로 볼 수 있다 — 메뉴판 배너·맛보기 "선물로 무료"·유료 줄 "선물 쓰면"·홈 한 줄이 같은 조건을 쓴다. */
export function isGiftFree(w: Wallet): boolean {
  return w.giftUnused && w.balance >= tarotPrice("one_card", "menu");
}

export interface PriceLine {
  /** 카드 오른쪽 — "선물로 무료" 또는 "⭐25" */
  main: string;
  /** 그 아래 한 줄(맛보기는 없음) */
  sub: string | null;
  /** "선물로 무료" 알약으로 그린다 */
  free: boolean;
}

/**
 * 맛보기: 선물로 볼 수 있으면 "선물로 무료", 아니면 "⭐15".
 * 유료: 모자란 만큼 — 선물로 볼 수 있으면(isGiftFree) "선물 쓰면 ⭐N만 더", 아니면 "⭐N만 더", 충분하면 "지금 잔액으로 바로".
 * (스펙의 "⭐(P−15)" 는 잔액 = 선물 15 일 때의 값이다 — 실제 잔액으로 계산한다)
 */
export function priceLine(p: MenuProduct, w: Wallet): PriceLine {
  const price = productPrice(p);
  if (p.tier === "teaser") {
    return isGiftFree(w)
      ? { main: "선물로 무료", sub: null, free: true }
      : { main: `⭐${price}`, sub: null, free: false };
  }
  const short = price - w.balance;
  if (short <= 0) return { main: `⭐${price}`, sub: "지금 잔액으로 바로", free: false };
  return {
    main: `⭐${price}`,
    // "선물 쓰면"도 맛보기와 같은 조건(isGiftFree) — giftUnused 만 보면 잔액이 15 미만인 응답(balance 라우트의 조회 실패 0)에서 틀린 약속이 된다
    sub: isGiftFree(w) ? `선물 쓰면 ⭐${short}만 더` : `⭐${short}만 더`,
    free: false,
  };
}

/** 홈 큰 카드(속마음·재회) 한 줄 — 메뉴판 그룹 로그인 유저만. 비로그인·옛 그룹·잔액 모름은 null(지금 홈 그대로, 스펙 §9-1).
 *  isGuest 를 따로 보는 이유: 스위치를 'menu' 로 돌리면 게스트도 menuArm "menu" 가 된다. */
export function homeMenuLine(o: { wallet: Wallet | null; count: number }): string | null {
  if (!o.wallet || o.wallet.isGuest || o.wallet.menuArm !== "menu") return null;
  // 320px 에서도 한 줄로(알약 안쪽 ≈168px) — 선물 문구는 짧게 줄였다(원래 "첫 질문은 공짜 · 깊게 보기까지"는 182px 로 넘쳤다, 사용자 결정 2026-10-09)
  return isGiftFree(o.wallet)
    ? `🃏 첫 질문 공짜 · 깊이 따라 ${o.count}가지`
    : `🃏 맛보기부터 깊게 보기까지 ${o.count}가지`;
}

/** 첫 풀이 분량(대략, 카드 수별). prod 9월~ 첫 답 중앙값: 1장 803 · 2장 1,189 · 3장 2,014 · 5장 3,061~3,554 · 7장 4,643~4,692자.
 *  6장은 prod 표본이 1건(3,792)뿐이라 페르소나 목표(3,500~4,200)·QA 평균(3,858)으로 잡았다. */
const FIRST_ANSWER_CHARS: Record<number, number> = { 1: 800, 2: 1200, 3: 2000, 5: 3500, 6: 3800, 7: 4700 };

export interface CompareFacts {
  /** 보는 질문 수 = 카드 수 */
  cards: number;
  /** productPositions 가 spreads.ts 의 공유 배열을 그대로 준다 — 고치지 말 것(Task 6 리뷰) */
  positions: readonly string[];
  /** "~3,500자" */
  chars: string;
  /** 자연 마무리 턴(WRAP_THRESHOLDS.hardCapTurn) */
  turns: number;
}

export function compareFacts(p: MenuProduct): CompareFacts {
  const cards = SPREAD_INFO[p.spreadType].cardCount;
  return {
    cards,
    positions: productPositions(p),
    chars: `~${FIRST_ANSWER_CHARS[cards].toLocaleString("ko-KR")}자`,
    turns: WRAP_THRESHOLDS[p.spreadType].hardCapTurn,
  };
}

const KO_COUNT: Record<number, string> = { 1: "한", 2: "두", 3: "세", 4: "네", 5: "다섯", 6: "여섯", 7: "일곱" };

/** 5 → "다섯 장" (버튼·비교 창 문구) */
export function koCardCount(n: number): string {
  return `${KO_COUNT[n] ?? String(n)} 장`;
}
