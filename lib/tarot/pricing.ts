// 타로 상품 가격 — 서버 차감·이어가기 가격·화면 표시가 함께 쓴다.
import { SPREAD_INFO, type SpreadType } from "./spreads.ts";

export function tarotPrice(spread: SpreadType): number {
  return SPREAD_INFO[spread].starCost;
}

/** 배포 순간 낡은 번들이 다른 가격을 보여 주면 차감 전에 막는다.
 * 숫자가 오면 그 값이어야 한다. 없거나 유효하지 않으면 통과한다. */
export function checkShownPrice(o: { expected: unknown; actual: number }): "ok" | "changed" {
  return (validShownPrice(o.expected) ?? o.actual) === o.actual ? "ok" : "changed";
}

/** 클라가 보낸 expectedCost 를 "화면이 본 가격"으로 칠 수 있으면(0 이상 정수) 그 숫자, 아니면 null(없는 것 — 옛 번들·이상한 값).
 *  판정(checkShownPrice)과 라우트의 WARN 기록(extra.expected)이 같은 정규화를 쓰게 한 곳에 둔다. */
export function validShownPrice(expected: unknown): number | null {
  return typeof expected === "number" && Number.isInteger(expected) && expected >= 0 ? expected : null;
}
