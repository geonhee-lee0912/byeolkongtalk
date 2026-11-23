import { test } from "node:test";
import assert from "node:assert/strict";
import { CARDS, resolveAudience, visibleCards } from "./hero-cards.ts";

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

// 2026-11-21 우리 사이·연애 시뮬 서비스 종료로 "sim" 카드를 뺐다 — 발견 3장 → 2장, 전체 5장 → 4장.
test("visibleCards(anon) — charge·survey 숨김, 발견 2장(intro 첫)", () => {
  const ids = visibleCards("anon").map((c) => c.id);
  assert.deepEqual(ids, ["intro", "gonghap"]);
});

test("visibleCards(new) — 전체 4장", () => {
  assert.equal(visibleCards("new").length, 4);
});

test("visibleCards(returning) — intro 숨김", () => {
  const ids = visibleCards("returning").map((c) => c.id);
  assert.deepEqual(ids, ["charge", "gonghap", "survey"]);
});

test("종료한 서비스(우리 사이·연애 시뮬)로 가는 카드가 없다", () => {
  for (const c of CARDS) assert.ok(!c.href.startsWith("/relationship"), `${c.id} → ${c.href}`);
});
