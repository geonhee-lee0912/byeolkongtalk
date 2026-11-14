import { test } from "node:test";
import assert from "node:assert/strict";
import { redrawCard, redrawTarget } from "./redraw";

test("고민과 태그가 있으면 이 고민을 넘겨 스프레드 고르기로 간다", () => {
  assert.deepEqual(redrawTarget("연락이 뜸해졌어", "걔 속마음이 궁금해"), {
    href: "/tarot",
    pending: { emotion: "걔 속마음이 궁금해", concern: "연락이 뜸해졌어", type: "tarot" },
  });
});

test("옛 태그는 지금 태그로 바꿔 넘긴다", () => {
  assert.equal(redrawTarget("고민", "그 사람 마음이 궁금해").pending?.emotion, "걔 속마음이 궁금해");
});

test("태그를 모르면 고민 적기로 보낸다(스프레드 고르기는 태그가 있어야 한다)", () => {
  assert.deepEqual(redrawTarget("고민", null), { href: "/concern", pending: null });
  assert.deepEqual(redrawTarget("고민", "없는 태그"), { href: "/concern", pending: null });
});

test("고민이 비어 있으면 고민 적기로 보낸다", () => {
  assert.deepEqual(redrawTarget("  ", "걔 속마음이 궁금해"), { href: "/concern", pending: null });
});

test("다시 뽑기 카드는 추천 묶음 맨 위 카드 모양 — 글은 A안, 가격은 가장 싼 스프레드부터", () => {
  assert.deepEqual(redrawCard("/tarot", 10), {
    href: "/tarot",
    emoji: "",
    iconSrc: "/icons/fortune/tarot_counsel.webp",
    label: "이 고민으로 카드 다시 뽑기",
    tagline: "고민은 그대로, 리딩 방법만 다시 골라",
    badge: "별 10부터",
    gradient: "#EFEAF6",
  });
});
