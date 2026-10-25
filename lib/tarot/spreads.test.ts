import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SPREAD_INFO,
  TAG_SPREADS,
  EMOTION_TO_CATEGORY,
  getPositionLabels,
  getSpreadDescription,
  type SpreadCategory,
} from "./spreads.ts";

// SPREAD_INFO.starCost = 반반 비교의 옛 그룹(지금 prod) 가격. 메뉴판 그룹 가격은 lib/tarot/pricing.ts 의 tarotPrice.
// prod 값으로 두는 이유: 그룹을 모르는 코드가 남아도 prod 와 같은 값을 보이게(스펙 §9-1 "옛 그룹 = prod 그대로").
test("옛 그룹(prod) 타로 가격은 카드 수로 정해진다 — 10·15·25·40·45·55", () => {
  const byCards: Record<number, number> = { 1: 10, 2: 15, 3: 25, 5: 40, 6: 45, 7: 55 };
  for (const [type, info] of Object.entries(SPREAD_INFO)) {
    assert.equal(info.starCost, byCards[info.cardCount], `${type} (${info.cardCount}장)`);
  }
});

// 스프레드 고르기 카드엔 설명 한 줄만 나간다 — 자리 이름 줄은 지웠다(spec 2026-10-25 §11). 설명이 실제 카드와 어긋나도 이제 옆에서 바로잡아 줄 줄이 없다.
const SHOWN = Object.entries(TAG_SPREADS).flatMap(([tag, spreads]) =>
  spreads.map((spread) => ({ tag, spread, category: EMOTION_TO_CATEGORY[tag as keyof typeof EMOTION_TO_CATEGORY] })),
);

test("자리 이름이 갈라지는 곳은 설명도 갈라진다 — 질문·카테고리 전용 자리에 기본 문장이 붙지 않게", () => {
  for (const { tag, spread, category } of SHOWN) {
    const labels = (c: SpreadCategory, t?: string) => getPositionLabels(spread, c, t).join("|");
    if (labels(category, tag) !== labels(category)) {
      assert.notEqual(getSpreadDescription(spread, category, tag), getSpreadDescription(spread, category), `${tag} · ${spread}: 질문 전용 자리인데 카테고리 문장`);
    }
    if (labels(category) !== labels("default")) {
      assert.notEqual(getSpreadDescription(spread, category), getSpreadDescription(spread, "default"), `${category} · ${spread}: 카테고리 전용 자리인데 기본 문장`);
    }
  }
});

test("화면에 나가는 설명은 50자 이하 — 길어지면 카드가 다시 빽빽해진다", () => {
  for (const { tag, spread, category } of SHOWN) {
    const d = getSpreadDescription(spread, category, tag);
    assert.ok([...d].length <= 50, `${tag} · ${spread}: ${[...d].length}자 — ${d}`);
  }
});
