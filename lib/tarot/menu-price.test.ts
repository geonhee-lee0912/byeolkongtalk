import { test } from "node:test";
import assert from "node:assert/strict";
import type { Wallet } from "../wallet.ts";
import { getMenu } from "./menu.ts";
import { isGiftFree, priceLine, homeMenuLine, compareFacts, koCardCount } from "./menu-price.ts";

const [teaser, mid, deep, full] = getMenu("걔 속마음이 궁금해");
const driftDeep = getMenu("요즘 우리, 예전 같지 않아")[2]; // checkin_6
const w = (balance: number, giftUnused: boolean, menuArm: Wallet["menuArm"] = "menu"): Wallet => ({
  balance,
  giftUnused,
  menuArm,
  isGuest: false,
});

test("isGiftFree — 선물 미사용 + 맛보기 가격 이상", () => {
  assert.equal(isGiftFree(w(15, true)), true);
  assert.equal(isGiftFree(w(14, true)), false);
  assert.equal(isGiftFree(w(100, false)), false);
});

test("priceLine — 맛보기", () => {
  assert.deepEqual(priceLine(teaser, w(15, true)), { main: "선물로 무료", sub: null, free: true });
  assert.deepEqual(priceLine(teaser, w(40, false)), { main: "⭐15", sub: null, free: false });
  assert.deepEqual(priceLine(teaser, w(0, false)), { main: "⭐15", sub: null, free: false });
});

test("priceLine — 유료: 선물 미사용(잔액 15)은 '선물 쓰면 ⭐(P−15)만 더'", () => {
  assert.equal(priceLine(mid, w(15, true)).sub, "선물 쓰면 ⭐10만 더");
  assert.equal(priceLine(deep, w(15, true)).sub, "선물 쓰면 ⭐40만 더");
  assert.equal(priceLine(full, w(15, true)).sub, "선물 쓰면 ⭐55만 더");
  assert.equal(priceLine(deep, w(15, true)).main, "⭐55");
});

test("priceLine — 유료: 선물을 쓴 유저는 모자란 만큼, 충분하면 '지금 잔액으로 바로'", () => {
  assert.equal(priceLine(deep, w(20, false)).sub, "⭐35만 더");
  assert.equal(priceLine(deep, w(55, false)).sub, "지금 잔액으로 바로");
  assert.equal(priceLine(mid, w(0, false)).sub, "⭐25만 더");
});

test("priceLine — 선물 미사용인데 잔액이 15 가 아니면 실제 잔액으로 계산", () => {
  assert.equal(priceLine(deep, w(25, true)).sub, "선물 쓰면 ⭐30만 더");
  assert.equal(priceLine(mid, w(25, true)).sub, "지금 잔액으로 바로");
});

test("homeMenuLine — 메뉴판 그룹 로그인 유저만, 비로그인·옛 그룹·모름은 null(지금 홈 그대로)", () => {
  assert.equal(homeMenuLine({ wallet: null, count: 4 }), null);
  assert.equal(homeMenuLine({ wallet: w(15, true, "legacy"), count: 4 }), null);
  // 스위치를 'menu' 로 돌리면 게스트도 menuArm "menu" 가 된다 — 그래도 게스트에겐 안 보인다(§9-1)
  assert.equal(homeMenuLine({ wallet: { ...w(0, false), isGuest: true }, count: 4 }), null);
  assert.equal(homeMenuLine({ wallet: w(15, true), count: 4 }), "🃏 첫 질문은 공짜 · 깊게 보기까지 4가지");
  assert.equal(homeMenuLine({ wallet: w(3, false), count: 4 }), "🃏 맛보기부터 깊게 보기까지 4가지");
});

test("compareFacts — 질문 수·자리·분량·자연 마무리 턴", () => {
  assert.deepEqual(compareFacts(teaser), { cards: 1, positions: ["질문의 답"], chars: "~800자", turns: 8 });
  const d = compareFacts(deep);
  assert.equal(d.cards, 5);
  assert.equal(d.positions.length, 5);
  assert.equal(d.chars, "~3,500자");
  assert.equal(d.turns, 13);
  assert.equal(compareFacts(mid).chars, "~2,000자");
  assert.equal(compareFacts(mid).turns, 10);
  assert.equal(compareFacts(driftDeep).chars, "~3,800자");
  assert.equal(compareFacts(driftDeep).turns, 15);
  assert.equal(compareFacts(full).chars, "~4,700자");
  assert.equal(compareFacts(full).turns, 17);
});

test("koCardCount — 한글 장수", () => {
  assert.equal(koCardCount(1), "한 장");
  assert.equal(koCardCount(5), "다섯 장");
  assert.equal(koCardCount(6), "여섯 장");
  assert.equal(koCardCount(7), "일곱 장");
});
