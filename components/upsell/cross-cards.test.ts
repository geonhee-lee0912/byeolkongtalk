import { test } from "node:test";
import assert from "node:assert/strict";
import { crossCards } from "./cross-cards.ts";
import { FORTUNE_CONFIG, type FortuneType } from "@/lib/fortune/types";

/**
 * 회귀 방지: FORTUNE_CONFIG 의 **모든** 타입에 대해 크로스셀 카드가 만들어져야 한다.
 *
 * 2026-07-30 prod 크래시(`undefined is not an object (evaluating 'e.href')`,
 * /fortune/result): W1 진열대 재편(73ee35d)으로 타로 리포트가 FORTUNE_LIST 에서
 * 빠지자, "같은 base 상품이 진열대에 반드시 있다"는 crossCards 의 가정이 깨져
 * 레거시 타로 리딩 결과 화면 전체가 죽었다. 진열대(FORTUNE_LIST) 구성이 또
 * 바뀌어도 이 테스트가 전 타입을 돌므로 같은 계열 사고를 빌드 전에 잡는다.
 */
const ALL_VARIANTS: ("counsel" | FortuneType)[] = [
  "counsel",
  ...(Object.keys(FORTUNE_CONFIG) as FortuneType[]),
];

test("crossCards — 모든 variant 에서 유효한 카드 ≥1장 (진열대 구성과 무관)", () => {
  for (const v of ALL_VARIANTS) {
    const cards = crossCards(v); // 어떤 variant 도 throw 하면 안 된다
    assert.ok(cards.length >= 1, `${v}: 카드 최소 1장`);
    for (const c of cards) {
      assert.equal(typeof c.href, "string", `${v}: href 누락`);
      assert.ok(c.href.startsWith("/"), `${v}: href 는 내부 경로`);
      assert.equal(typeof c.label, "string", `${v}: label 누락`);
    }
  }
});

test("crossCards — 진열대에 같은 base 가 없으면(레거시 타로) 오늘의 운세로 폴백", () => {
  const tarotLegacy: FortuneType[] = [
    "tarot_daily",
    "tarot_love",
    "tarot_money",
    "tarot_career",
    "tarot_relation",
  ];
  for (const v of tarotLegacy) {
    const [counsel, second] = crossCards(v);
    assert.equal(counsel.href, "/", `${v}: 첫 카드는 상담`);
    assert.equal(second.href, FORTUNE_CONFIG.daily.href, `${v}: 폴백은 daily`);
  }
});

test("crossCards — counsel 은 궁합 분석 1장", () => {
  const cards = crossCards("counsel");
  assert.equal(cards.length, 1);
  assert.equal(cards[0].href, FORTUNE_CONFIG.compat.href);
});
