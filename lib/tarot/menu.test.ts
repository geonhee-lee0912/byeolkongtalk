import { test } from "node:test";
import assert from "node:assert/strict";
import { EMOTION_OPTIONS } from "../emotions.ts";
import { WELCOME_BONUS_STARS } from "../constants.ts";
import { SPREAD_INFO } from "./spreads.ts";
import { tarotPrice } from "./pricing.ts";
import {
  MENU_TIER_ORDER,
  getMenu,
  getDeepProduct,
  productForReading,
  productPositions,
  productPrice,
} from "./menu.ts";

const TAGS = EMOTION_OPTIONS.map((o) => o.tag);
const ALL = TAGS.flatMap((t) => getMenu(t));

test("질문 10개 모두 메뉴가 있고 3개 또는 4개 — 상품 32개", () => {
  assert.equal(TAGS.length, 10);
  for (const t of TAGS) {
    const n = getMenu(t).length;
    assert.ok(n === 3 || n === 4, `${t}: ${n}`);
  }
  assert.equal(ALL.length, 32);
});

test("끝까지(7장)는 속마음·재회에만", () => {
  const withFull = TAGS.filter((t) => getMenu(t).some((p) => p.tier === "full"));
  assert.deepEqual(withFull, ["걔 속마음이 궁금해", "재회할 수 있을까"]);
});

test("계층 순서 맛보기 → 3장 → 깊게 → 끝까지 · 깊게는 정확히 1개", () => {
  for (const t of TAGS) {
    const tiers = getMenu(t).map((p) => p.tier);
    assert.deepEqual(tiers, MENU_TIER_ORDER.slice(0, tiers.length), t);
    assert.equal(tiers.filter((x) => x === "deep").length, 1, t);
  }
});

test("맛보기 = 원카드 · 3장 = 쓰리카드 · 깊게 = 5~6장 · 끝까지 = 7장 · 투카드 없음", () => {
  for (const p of ALL) {
    const n = SPREAD_INFO[p.spreadType].cardCount;
    if (p.tier === "teaser") assert.equal(p.spreadType, "one_card", p.key);
    if (p.tier === "mid") assert.equal(p.spreadType, "three_card", p.key);
    if (p.tier === "deep") assert.ok(n === 5 || n === 6, p.key);
    if (p.tier === "full") assert.equal(n, 7, p.key);
    assert.notEqual(p.spreadType, "two_card", p.key);
  }
});

test("key 유일 · `${slug}_${tier}` 모양", () => {
  const keys = ALL.map((p) => p.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const p of ALL) assert.match(p.key, new RegExp(`^[a-z]+_${p.tier}$`));
});

test("카드 자리는 비어 있지 않고 카드 수와 같다", () => {
  for (const p of ALL) {
    const pos = productPositions(p);
    assert.equal(pos.length, SPREAD_INFO[p.spreadType].cardCount, p.key);
    for (const l of pos) assert.ok(l.trim().length > 0, p.key);
  }
});

test("가격 = 메뉴판 그룹 가격 — 맛보기 15 · 3장 25 · 깊게 55 · 끝까지 70", () => {
  const byTier = { teaser: 15, mid: 25, deep: 55, full: 70 } as const;
  for (const p of ALL) {
    assert.equal(productPrice(p), tarotPrice(p.spreadType, "menu"), p.key);
    assert.equal(productPrice(p), byTier[p.tier], p.key);
  }
});

test("이름 원칙 — 맛보기만 '한 장으로' 로 끝나고 나머지는 카드 수 접미사 없음(부록 A)", () => {
  for (const p of ALL) {
    if (p.tier === "teaser") assert.match(p.name, /[,?] 한 장으로$/, p.key);
    else assert.doesNotMatch(p.name, /장으로$/, p.key);
  }
});

test("부록 A 스냅샷 — 속마음 메뉴", () => {
  assert.deepEqual(
    getMenu("걔 속마음이 궁금해").map((p) => [p.tier, p.spreadType, p.name]),
    [
      ["teaser", "one_card", "지금 걔 마음, 한 장으로"],
      ["mid", "three_card", "걔와 나, 지금 어떤 사이일까"],
      ["deep", "deep_feelings_5", "걔가 망설이는 진짜 이유"],
      ["full", "potential_7", "우리, 앞으로 이어질 수 있을까"],
    ]
  );
});

test("부록 A — 직장 깊게는 대인 라벨(거리를 두는 이유)", () => {
  const deep = getDeepProduct("직장·학교에서 사람이 어려워")!;
  assert.equal(deep.name, "그 사람이 거리를 두는 이유");
  assert.deepEqual(productPositions(deep), [
    "겉으로 보이는 태도",
    "그 사람의 속마음",
    "거리를 두는 이유",
    "나에 대한 평가",
    "다가올 태도",
  ]);
});

test("productForReading — 메뉴 조합만 복원, 투카드·옛 큐레이션은 null", () => {
  assert.equal(productForReading("재회할 수 있을까", "reunion_5")?.key, "reunion_deep");
  assert.equal(productForReading("걔 속마음이 궁금해", "two_card"), null);
  assert.equal(productForReading("새로운 인연, 언제쯤 올까", "readiness_6"), null);
  assert.equal(productForReading(null, "one_card"), null);
});

test("getMenu — 구 태그는 정규화, 모르는 태그는 빈 배열", () => {
  assert.equal(getMenu("그 사람 마음이 궁금해")[0]?.tag, "걔 속마음이 궁금해");
  assert.deepEqual(getMenu("없는 태그"), []);
  assert.deepEqual(getMenu(null), []);
});

test("가입 선물로 맛보기를 볼 수 있다 — '첫 질문은 공짜' 약속", () => {
  assert.ok(WELCOME_BONUS_STARS >= tarotPrice("one_card", "menu"));
});
