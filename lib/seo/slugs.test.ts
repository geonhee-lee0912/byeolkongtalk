import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCardSlug, findCardBySlug, getAllCardSlugs } from "./tarot-slugs.ts";
import { buildSpreadSlug, findSpreadBySlug, getAllSpreadSlugs } from "./spread-slugs.ts";
import { TAG_SLUGS, findTagBySlug } from "./tags.ts";
import { getCard } from "../tarot/cards.ts";
import { EMOTION_OPTIONS } from "../emotions.ts";

test("메이저 슬러그 — name_en 케밥", () => {
  assert.equal(buildCardSlug(getCard(0)!), "the-fool");
});

test("마이너 슬러그 — 슈트-랭크", () => {
  assert.equal(buildCardSlug(getCard(22)!), "wands-ace");
});

test("마이너 코트 슬러그 — 문자 랭크 코드(P/N/Q/K), 슈트 P 와 랭크 P 겹침 없이 구분", () => {
  // data/tarot_card_data.json 의 코트 카드 id 는 "W11"~"W14" 가 아니라
  // "WP"/"WN"/"WQ"/"WK" 문자 코드 — 숫자 2자리만 가정하면 78장 중 16장이 깨진다.
  assert.equal(buildCardSlug(getCard(32)!), "wands-page");
  assert.equal(buildCardSlug(getCard(33)!), "wands-knight");
  assert.equal(buildCardSlug(getCard(34)!), "wands-queen");
  assert.equal(buildCardSlug(getCard(35)!), "wands-king");
  assert.equal(buildCardSlug(getCard(74)!), "pentacles-page"); // 슈트 코드 P + 랭크 코드 P
});

test("78장 슬러그 전부 유일 + 역조회 일치", () => {
  const slugs = getAllCardSlugs();
  assert.equal(slugs.length, 78);
  assert.equal(new Set(slugs).size, 78);
  for (const s of slugs) assert.ok(findCardBySlug(s), `역조회 실패: ${s}`);
});

test("스프레드 슬러그 14종 왕복", () => {
  const slugs = getAllSpreadSlugs();
  assert.equal(slugs.length, 14);
  for (const s of slugs) {
    const t = findSpreadBySlug(s);
    assert.ok(t, `역조회 실패: ${s}`);
    assert.equal(buildSpreadSlug(t), s);
  }
});

test("태그 슬러그 10종이 EmotionTag 와 정확히 일치", () => {
  const slugs = Object.keys(TAG_SLUGS);
  assert.equal(slugs.length, 10);
  const known = new Set(EMOTION_OPTIONS.map((o) => o.tag));
  for (const s of slugs) {
    const tag = findTagBySlug(s);
    assert.ok(tag, `역조회 실패: ${s}`);
    assert.ok(known.has(tag), `EmotionTag 불일치: ${tag}`);
  }
  assert.equal(new Set(Object.values(TAG_SLUGS)).size, 10);
});
