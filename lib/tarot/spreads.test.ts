import { test } from "node:test";
import assert from "node:assert/strict";
import { SPREAD_INFO } from "./spreads.ts";

// 가격 사다리 (스펙 2026-10-05-타로톡-메뉴판-별경제 §3-2): 맛보기 15 · 3장 25 · 깊게(5·6장) 55 · 끝까지(7장) 70.
// 투카드는 메뉴 밖이지만 엔진·예전 리딩·이어가기용으로 15 그대로. 메뉴 밖 스프레드(readiness_6·chakra_7)도 카드 수 기준을 따른다.
test("타로 가격은 카드 수로 정해진다", () => {
  const byCards: Record<number, number> = { 1: 15, 2: 15, 3: 25, 5: 55, 6: 55, 7: 70 };
  for (const [type, info] of Object.entries(SPREAD_INFO)) {
    assert.equal(info.starCost, byCards[info.cardCount], `${type} (${info.cardCount}장)`);
  }
});
