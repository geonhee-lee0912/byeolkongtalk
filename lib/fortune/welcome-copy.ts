import { WELCOME_BONUS_STARS } from "../constants.ts";

/** 비로그인 구매 칸 벽 문구 — 웰컴 별을 알린다. 웰컴 별로 살 수 있는 가격일 때만 "바로 볼 수 있어"라고 한다
 * (20별+ 상품에 그렇게 말하면 거짓말). `what` = 무엇을 보게 되는지("내 사주로", "두 사람 궁합을"). */
export function welcomeWallLine(cost: number, what: string): string {
  if (cost > 0 && cost <= WELCOME_BONUS_STARS) {
    return `로그인하면 웰컴 별 ${WELCOME_BONUS_STARS}개를 줘 — 이 리포트는 그걸로 바로 볼 수 있어.`;
  }
  return `로그인하면 웰컴 별 ${WELCOME_BONUS_STARS}개를 선물로 줘. ${what} 볼 수 있어.`;
}
