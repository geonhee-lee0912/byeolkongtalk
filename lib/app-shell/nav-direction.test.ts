import { test } from "node:test";
import assert from "node:assert/strict";
import { markBackButton, navKindForClick, navKindForPopstate, takeBackButton } from "./nav-direction.ts";

const LINK = { sameOrigin: true, target: null, download: false, modified: false, navAttr: null, samePath: false };

test("같은 사이트 일반 링크 → forward", () => {
  assert.equal(navKindForClick(LINK), "forward");
});

test("탭 표시 링크 → tab", () => {
  assert.equal(navKindForClick({ ...LINK, navAttr: "tab" }), "tab");
});

test("이동이 아닌 클릭은 null — 새 창·내려받기·보조키·바깥 사이트·같은 주소", () => {
  assert.equal(navKindForClick({ ...LINK, target: "_blank" }), null);
  assert.equal(navKindForClick({ ...LINK, download: true }), null);
  assert.equal(navKindForClick({ ...LINK, modified: true }), null);
  assert.equal(navKindForClick({ ...LINK, sameOrigin: false }), null);
  assert.equal(navKindForClick({ ...LINK, samePath: true }), null);
});

test("target=_self 는 이동이다", () => {
  assert.equal(navKindForClick({ ...LINK, target: "_self" }), "forward");
});

test("아이폰 — ‹ 로 간 뒤로는 back, 손가락 뒤로 가기는 none(웹뷰가 이미 움직인다)", () => {
  assert.equal(navKindForPopstate("ios", true), "back");
  assert.equal(navKindForPopstate("ios", false), "none");
});

test("안드로이드 — 어떤 뒤로든 back", () => {
  assert.equal(navKindForPopstate("android", false), "back");
  assert.equal(navKindForPopstate("android", true), "back");
});

test("‹ 표시는 한 번만 꺼내진다", () => {
  assert.equal(takeBackButton(), false);
  markBackButton();
  assert.equal(takeBackButton(), true);
  assert.equal(takeBackButton(), false);
});
