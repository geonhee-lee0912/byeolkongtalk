import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  contentMetadata,
  noindexMetadata,
  OG_IMAGE_ALT,
  TITLE_TEMPLATE,
} from "./metadata.ts";
import { buildCardSlug, findCardBySlug, getAllCardSlugs } from "./tarot-slugs.ts";
import { buildSpreadSlug, findSpreadBySlug, getAllSpreadSlugs } from "./spread-slugs.ts";
import { SLUG_TO_TAG, findTagBySlug } from "./tags.ts";
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

test("마이너 56장 — 수트별 id 오름차순이 ace→king 랭크와 값까지 일치", () => {
  // 기대 랭크 순서는 구현(RANK_EN)을 되읽지 않고 여기 독립적으로 적는다 —
  // 되읽으면 두 항목이 전치돼도 자기 자신과 일치해 그냥 통과한다.
  // 유일성·왕복 테스트도 전치를 못 잡는다(전치된 값도 여전히 유일하고 왕복함).
  const EXPECTED_RANKS = [
    "ace", "two", "three", "four", "five", "six", "seven",
    "eight", "nine", "ten", "page", "knight", "queen", "king",
  ];
  // 마이너는 id 22 부터 수트당 14장씩 완드→컵→소드→펜타클 순 (cards.ts getAllCards)
  const SUITS_IN_ID_ORDER = ["wands", "cups", "swords", "pentacles"];

  SUITS_IN_ID_ORDER.forEach((suit, suitIdx) => {
    EXPECTED_RANKS.forEach((rank, rankIdx) => {
      const id = 22 + suitIdx * 14 + rankIdx;
      assert.equal(buildCardSlug(getCard(id)!), `${suit}-${rank}`, `id ${id}`);
    });
  });
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
  const slugs = Object.keys(SLUG_TO_TAG);
  assert.equal(slugs.length, 10);
  const known = new Set(EMOTION_OPTIONS.map((o) => o.tag));
  for (const s of slugs) {
    const tag = findTagBySlug(s);
    assert.ok(tag, `역조회 실패: ${s}`);
    assert.ok(known.has(tag), `EmotionTag 불일치: ${tag}`);
  }
  assert.equal(new Set(Object.values(SLUG_TO_TAG)).size, 10);
});

test("contentMetadata — og/twitter 공용 필드가 빠지지 않는다", () => {
  // 이 단정들이 없으면 metadata.ts 의 공용 필드 재선언을 "중복"으로 보고 지워도
  // 빌드·tsc·나머지 테스트가 전부 통과한다 — 조용히 공유 카드 이미지만 사라진다.
  const m = contentMetadata({ title: "제목", description: "설명", path: "/guide/x" });

  assert.equal(m.openGraph?.title, "제목");
  assert.equal(m.openGraph?.siteName, "별콩톡");
  assert.equal(m.openGraph?.locale, "ko_KR");
  assert.ok(Array.isArray(m.openGraph?.images) && m.openGraph.images.length === 1, "og:image 소실");
  assert.ok(Array.isArray(m.twitter?.images) && m.twitter.images.length === 1, "twitter:image 소실");
  // Metadata["twitter"] 는 카드 종류별 유니온이라 card 를 바로 못 읽는다 — in 으로 좁힌다
  assert.ok(m.twitter && "card" in m.twitter && m.twitter.card === "summary_large_image");
  assert.equal(m.alternates?.canonical, "/guide/x");

  const og = (m.openGraph?.images as { alt: string }[])[0];
  assert.equal(og.alt, OG_IMAGE_ALT);
});

test("noindexMetadata — canonical 을 명시 해제하고 og/twitter 키는 아예 두지 않는다", () => {
  const m = noindexMetadata({ title: "내 정보", description: "설명" });

  // undefined(=키 없음)면 루트 layout 의 canonical:"/" 가 상속돼 이 화면들이
  // "나는 사실 홈이다"라고 신고한다 — 그게 원래 결함이었다. null 이어야 해제된다.
  assert.ok("alternates" in m, "alternates 키가 없으면 루트 canonical 이 그대로 상속된다");
  assert.equal(m.alternates?.canonical, null);
  assert.deepEqual(m.robots, { index: false, follow: false });

  // Next 는 openGraph/twitter 를 선언한 세그먼트에서 객체 통째로 교체한다.
  // 여기에 일부만 채우는 순간 루트의 siteName·locale·type 과
  // app/opengraph-image.tsx 의 og:image 4종이 조용히 사라진다(twitter:image 포함).
  // 키를 아예 두지 않아야 루트 값이 온전히 상속된다.
  assert.equal("openGraph" in m, false, "openGraph 를 선언하면 og:image 가 날아간다");
  assert.equal("twitter" in m, false, "twitter 를 선언하면 twitter:image 가 날아간다");
});

test("TITLE_TEMPLATE 이 app/layout.tsx 의 title.template 과 갈리지 않는다", () => {
  // 하위 라우트를 가진 세그먼트들이 이 사본으로 접미사를 다시 심는다.
  // 루트만 바꾸면 그 화면들의 제목 접미사가 조용히 옛 문구로 남는다.
  const src = readFileSync(
    new URL("../../app/layout.tsx", import.meta.url),
    "utf8",
  );
  const m = src.match(/template: "([^"]*)"/);
  assert.ok(m, "app/layout.tsx 에서 `title.template` 을 못 찾았다");
  assert.equal(m[1], TITLE_TEMPLATE);
});

test("og:image alt 이 app/opengraph-image.tsx 와 갈리지 않는다", () => {
  // 같은 문자열을 두 곳이 들고 있다(그 파일에서 import 하면 next/og 가 딸려온다).
  // 한쪽만 고치면 루트와 콘텐츠 존의 og:image:alt 가 조용히 달라지므로 소스를 직접 대조.
  const src = readFileSync(
    new URL("../../app/opengraph-image.tsx", import.meta.url),
    "utf8",
  );
  const m = src.match(/export const alt = "([^"]*)"/);
  assert.ok(m, "app/opengraph-image.tsx 에서 `export const alt` 를 못 찾았다");
  assert.equal(m[1], OG_IMAGE_ALT);
});
