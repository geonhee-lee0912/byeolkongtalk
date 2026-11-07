import { test } from "node:test";
import assert from "node:assert/strict";
import { markBackButton, navKindForClick, navKindForPopstate, requestBack, takeBackButton } from "./nav-direction.ts";

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

test("경로가 같고 쿼리만 다르면 이동으로 보지 않는다(같은 화면 안 탭) — 리뷰 #4", () => {
  assert.equal(navKindForClick({ ...LINK, samePath: true }), null);
});

test("뒤로 대기 — 대기 중 두 번째 요청은 무시, popstate 가 오면 풀리고 막힘 처리는 안 부른다 — 리뷰 #1·#2", async () => {
  const target = new EventTarget();
  let backs = 0;
  let stuck = 0;
  assert.equal(requestBack(target, () => backs++, () => stuck++, 30), true);
  assert.equal(requestBack(target, () => backs++, () => stuck++, 30), false);
  target.dispatchEvent(new Event("popstate"));
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(backs, 1);
  assert.equal(stuck, 0);
  assert.equal(requestBack(target, () => backs++, () => stuck++, 30), true);
  target.dispatchEvent(new Event("popstate"));
});

test("뒤로 대기 — popstate 가 안 오면(기록 맨 앞) 막힘 처리를 한 번 부르고 풀린다", async () => {
  const target = new EventTarget();
  let stuck = 0;
  requestBack(target, () => {}, () => stuck++, 20);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(stuck, 1);
  assert.equal(requestBack(target, () => {}, () => stuck++, 20), true);
  target.dispatchEvent(new Event("popstate"));
});
