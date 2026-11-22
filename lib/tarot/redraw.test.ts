import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EMOTION_KEY } from "@/lib/consultation-entry";
import { PENDING_KEY } from "@/lib/emotions";
import { redrawCard, redrawStorage, redrawTarget } from "./redraw";

test("고민과 태그가 있으면 이 고민을 넘겨 스프레드 고르기로 간다", () => {
  assert.deepEqual(redrawTarget("연락이 뜸해졌어", "걔 속마음이 궁금해"), {
    href: "/tarot",
    pending: { emotion: "걔 속마음이 궁금해", concern: "연락이 뜸해졌어", type: "tarot" },
  });
});

test("옛 태그는 지금 태그로 바꿔 넘긴다", () => {
  assert.equal(redrawTarget("고민", "그 사람 마음이 궁금해").pending?.emotion, "걔 속마음이 궁금해");
});

test("태그를 모르면 홈 고민 고르기로 보낸다(고민 적기도 태그가 있어야 열린다)", () => {
  assert.deepEqual(redrawTarget("고민", null), { href: "/#emotion-grid", pending: null });
  assert.deepEqual(redrawTarget("고민", "없는 태그"), { href: "/#emotion-grid", pending: null });
});

test("고민이 비어 있으면 홈 고민 고르기로 보낸다", () => {
  assert.deepEqual(redrawTarget("  ", "걔 속마음이 궁금해"), { href: "/#emotion-grid", pending: null });
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

test("넘길 고민과 함께 태그도 심는다 — 없으면 '고민 다시 적기'가 홈으로 튕긴다", () => {
  const { pending } = redrawTarget("연락이 뜸해졌어", "걔 속마음이 궁금해");
  assert.deepEqual(redrawStorage(pending), [
    [PENDING_KEY, JSON.stringify(pending)],
    [EMOTION_KEY, "걔 속마음이 궁금해"],
  ]);
  assert.deepEqual(redrawStorage(null), []);
});

test("결과 화면: 남도 /concern 으로 안 보내고, 저장은 redrawStorage 로", () => {
  const s = readFileSync("app/tarot/result/page.tsx", "utf8");
  assert.doesNotMatch(s, /href: "\/concern"/);
  assert.match(s, /redrawStorage\(redraw\.pending\)/);
});
