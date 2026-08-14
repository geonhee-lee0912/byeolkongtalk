import { test } from "node:test";
import assert from "node:assert/strict";
import { CARDS, resolveAudience, visibleCards, startIndex } from "./hero-cards.ts";

test("resolveAudience — 비로그인은 anon (이력 무관)", () => {
  assert.equal(resolveAudience(false, null), "anon");
  assert.equal(resolveAudience(false, true), "anon");
});

test("resolveAudience — 로그인+이력판정불가는 null(로딩 기본)", () => {
  assert.equal(resolveAudience(true, null), null);
});

test("resolveAudience — 로그인+이력0은 new, 이력있으면 returning", () => {
  assert.equal(resolveAudience(true, false), "new");
  assert.equal(resolveAudience(true, true), "returning");
});

test("visibleCards(null) — 로딩 중엔 전체", () => {
  assert.equal(visibleCards(null).length, CARDS.length);
});

test("visibleCards(anon) — charge·survey 숨김, 발견 4장(intro 첫)", () => {
  const ids = visibleCards("anon").map((c) => c.id);
  assert.deepEqual(ids, ["intro", "gonghap", "sim", "pass"]);
});

test("visibleCards(new) — 전체 6장", () => {
  assert.equal(visibleCards("new").length, 6);
});

test("visibleCards(returning) — intro 숨김, sim 포함", () => {
  const ids = visibleCards("returning").map((c) => c.id);
  assert.ok(!ids.includes("intro"), "기존 유저에 intro 숨김");
  assert.ok(ids.includes("sim"), "sim 포함");
});

test("startIndex — returning 은 sim 위치에서 시작", () => {
  const cards = visibleCards("returning");
  const idx = startIndex("returning", cards);
  assert.equal(cards[idx].id, "sim");
});

test("startIndex — 그 외(anon·new·로딩)는 첫 카드(intro)", () => {
  for (const a of ["anon", "new", null] as const) {
    const cards = visibleCards(a);
    assert.equal(startIndex(a, cards), 0);
    assert.equal(cards[0].id, "intro");
  }
});

test("pass 카드 목적지는 /relationship (샵 아님)", () => {
  const pass = CARDS.find((c) => c.id === "pass");
  assert.equal(pass?.href, "/relationship");
});
