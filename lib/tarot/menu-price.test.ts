import { test } from "node:test";
import assert from "node:assert/strict";
import type { Wallet } from "../wallet.ts";
import { EMOTION_OPTIONS } from "../emotions.ts";
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
  // 선물 미사용이어도 잔액이 맛보기 가격 미만이면 "선물로 무료"를 약속하지 않는다
  assert.deepEqual(priceLine(teaser, w(14, true)), { main: "⭐15", sub: null, free: false });
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
  // 경계 — 1별 모자라면 아직 "모자란" 쪽이다(뽑은 뒤 잔액 부족 팝업과 모순되면 안 된다)
  assert.deepEqual(priceLine(deep, w(54, false)), { main: "⭐55", sub: "⭐1만 더", free: false });
});

test("priceLine — 선물 미사용인데 잔액이 15 가 아니면 실제 잔액으로 계산", () => {
  assert.equal(priceLine(deep, w(25, true)).sub, "선물 쓰면 ⭐30만 더");
  assert.equal(priceLine(mid, w(25, true)).sub, "지금 잔액으로 바로");
  // 경계 P — 선물 미사용이어도 잔액이 가격과 같으면 바로(유료 줄은 "선물로 무료" 알약이 아니다)
  assert.deepEqual(priceLine(deep, w(55, true)), { main: "⭐55", sub: "지금 잔액으로 바로", free: false });
  // 선물 미사용인데 잔액이 15 미만 — balance 라우트는 잔액 조회 실패를 0 으로 내려도 giftUnused 는 따로 오므로 실제로 있는 응답이다.
  // 맛보기와 같은 조건(isGiftFree)이라 "선물 쓰면"을 약속하지 않는다
  assert.equal(priceLine(deep, w(14, true)).sub, "⭐41만 더");
});

test("homeMenuLine — 메뉴판 그룹 로그인 유저만, 비로그인·옛 그룹·모름은 null(지금 홈 그대로)", () => {
  assert.equal(homeMenuLine({ wallet: null, count: 4 }), null);
  assert.equal(homeMenuLine({ wallet: w(15, true, "legacy"), count: 4 }), null);
  // 스위치를 'menu' 로 돌리면 게스트도 menuArm "menu" 가 된다 — 그래도 게스트에겐 안 보인다(§9-1)
  assert.equal(homeMenuLine({ wallet: { ...w(0, false), isGuest: true }, count: 4 }), null);
  assert.equal(homeMenuLine({ wallet: w(15, true), count: 4 }), "🃏 첫 질문은 공짜 · 깊게 보기까지 4가지");
  assert.equal(homeMenuLine({ wallet: w(3, false), count: 4 }), "🃏 맛보기부터 깊게 보기까지 4가지");
  // 선물 미사용이어도 잔액이 15 미만이면 "첫 질문은 공짜"를 약속하지 않는다
  assert.equal(homeMenuLine({ wallet: w(14, true), count: 4 }), "🃏 맛보기부터 깊게 보기까지 4가지");
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

test("compareFacts — 메뉴 32개 전부 분량·턴·자리가 채워진다(새 카드 수 상품이 표에 없으면 여기서 잡힌다)", () => {
  const products = EMOTION_OPTIONS.flatMap((o) => getMenu(o.tag));
  assert.equal(products.length, 32); // 목록이 비어 아무것도 안 돌고 통과하는 것을 막는다
  for (const p of products) {
    // 카드 수가 분량 표(FIRST_ANSWER_CHARS)에 없으면 compareFacts 가 던진다 — 어느 상품인지 메시지에 남긴다
    assert.doesNotThrow(() => compareFacts(p), p.key);
    const f = compareFacts(p);
    assert.match(f.chars, /^~[\d,]+자$/, `${p.key}: ${f.chars}`);
    assert.ok(Number.isInteger(f.turns) && f.turns > 0, `${p.key}: turns ${f.turns}`);
    assert.equal(f.positions.length, f.cards, p.key);
  }
});

test("koCardCount — 한글 장수", () => {
  assert.equal(koCardCount(1), "한 장");
  assert.equal(koCardCount(5), "다섯 장");
  assert.equal(koCardCount(6), "여섯 장");
  assert.equal(koCardCount(7), "일곱 장");
});
