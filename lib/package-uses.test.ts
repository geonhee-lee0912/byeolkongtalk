import { test } from "node:test";
import assert from "node:assert/strict";
import { STAR_PACKAGES, shopPackages } from "./constants.ts";
import { tarotPrice } from "./tarot/pricing.ts";
import { CLARIFIER_COST, EXTEND_COST } from "./upsell.ts";
import { PACKAGE_USES } from "./package-uses.ts";

const stars = (id: string) => STAR_PACKAGES.find((p) => p.id === id)!.stars;
const TEASER = tarotPrice("one_card", "menu");
const MID = tarotPrice("three_card", "menu");
const DEEP = Math.max(tarotPrice("deep_feelings_5", "menu"), tarotPrice("checkin_6", "menu"));
const FULL = tarotPrice("potential_7", "menu");

test("메뉴판 상점 진열 패키지마다 쓸 곳 한 줄이 있다", () => {
  for (const p of shopPackages("menu")) assert.ok(PACKAGE_USES[p.id], p.id);
});

test("쓸 곳 문구의 산수가 메뉴판 가격과 맞는다 — 가격을 바꾸면 문구부터 고칠 것", () => {
  assert.ok(stars("star_10") >= CLARIFIER_COST && stars("star_10") >= EXTEND_COST, "한 장 더 · 대화 4턴 더");
  assert.ok(stars("star_30") >= MID && stars("star_30") >= TEASER * 2, "세 장 한 판 · 맛보기 두 판");
  assert.ok(stars("star_55") >= DEEP, "깊게 한 판");
  assert.ok(stars("star_70") >= FULL && stars("star_70") >= DEEP + TEASER, "끝까지 한 판 · 깊게 한 판 + 맛보기");
  assert.ok(stars("star_130") >= DEEP * 2 + TEASER, "깊게 두 판 + 맛보기 한 판");
});
