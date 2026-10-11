// 로그인 전 방문자 가격 표시 — '가입 선물 15별을 막 받은 신규 회원' 기준. 표시만 한다(서버 차감 가격 tarotPrice 는 불변).
// 스펙: docs/superpowers/specs/2026-10-11-타로-로그인전-맛보기-design.md §3-1
import { WELCOME_BONUS_STARS } from "../constants.ts";
import { receivedStars, sheetPackages } from "../recharge-default.ts";
import type { Wallet } from "../wallet.ts";
import type { MenuArm } from "./menu-ab.ts";

/** 로그인 전 화면이 쓰는 표시용 지갑 — 메뉴판(priceLine·isGiftFree)이 신규 회원처럼 그린다.
 *  서버 지갑을 대신하지 않는다 — 차감·잔액 판단은 로그인 뒤 서버가 다시 한다 */
export function guestWallet(arm: MenuArm): Wallet {
  return { balance: WELCOME_BONUS_STARS, isGuest: true, giftUnused: true, menuArm: arm, entryArm: "new" };
}

/** 모자란 별을 덮는 가장 작은 시트 패키지 값(원) — 첫 충전 보너스 포함(신규 회원의 첫 결제). 0 이하는 0, 시트 칸으로 못 덮으면 null */
export function minTopUpWon(short: number, arm: MenuArm): number | null {
  if (short <= 0) return 0;
  const pkg = [...sheetPackages(arm)]
    .sort((a, b) => a.stars - b.stars)
    .find((p) => receivedStars(p, true) >= short);
  return pkg ? pkg.price : null;
}

const won = (n: number) => `₩${n.toLocaleString("ko-KR")}`;

/** 상품 한 줄 — 가격 P 를 선물 15 기준으로. free = 선물로 다 된다 */
export function guestShortLine(price: number, arm: MenuArm): { free: boolean; text: string } {
  const short = price - WELCOME_BONUS_STARS;
  if (short <= 0) return { free: true, text: "가입 선물로 무료" };
  const w = minTopUpWon(short, arm);
  return { free: false, text: `가입 선물 + ⭐${short}만 더${w ? ` (${won(w)}부터)` : ""}` };
}

/** 로그인 창 가격 줄 */
export function guestSheetLine(price: number, arm: MenuArm): string {
  const short = price - WELCOME_BONUS_STARS;
  if (short <= 0) return "첫 풀이는 가입 선물로 무료";
  const w = minTopUpWon(short, arm);
  return `가입 선물 ${WELCOME_BONUS_STARS}별 + ⭐${short}만 더${w ? ` (${won(w)}부터)` : ""}`;
}
