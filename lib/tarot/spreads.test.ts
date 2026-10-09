import { test } from "node:test";
import assert from "node:assert/strict";
import { SPREAD_INFO } from "./spreads.ts";

// SPREAD_INFO.starCost = 반반 비교의 옛 그룹(지금 prod) 가격. 메뉴판 그룹 가격은 lib/tarot/pricing.ts 의 tarotPrice.
// prod 값으로 두는 이유: 그룹을 모르는 코드가 남아도 prod 와 같은 값을 보이게(스펙 §9-1 "옛 그룹 = prod 그대로").
test("옛 그룹(prod) 타로 가격은 카드 수로 정해진다 — 10·15·25·40·45·55", () => {
  const byCards: Record<number, number> = { 1: 10, 2: 15, 3: 25, 5: 40, 6: 45, 7: 55 };
  for (const [type, info] of Object.entries(SPREAD_INFO)) {
    assert.equal(info.starCost, byCards[info.cardCount], `${type} (${info.cardCount}장)`);
  }
});
