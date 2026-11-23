import { test } from "node:test";
import assert from "node:assert/strict";
import { hubCardTile } from "./hub-card-tile.ts";

test("오늘 뽑은 카드가 있으면 타일 카드", () => {
  assert.deepEqual(hubCardTile({ card: { cardId: 7, date: "2026-11-08" } }), { cardId: 7 });
  assert.deepEqual(hubCardTile({ card: { cardId: 0 } }), { cardId: 0 });
});

test("오늘 아직 안 뽑았으면(card: null) 없음 — 기억해 둔 어제 카드를 지운다(Codex PR #23 P2)", () => {
  assert.equal(hubCardTile({ card: null }), null);
  assert.equal(hubCardTile({}), null);
  assert.equal(hubCardTile(null), null);
});
