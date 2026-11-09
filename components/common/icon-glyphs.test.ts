// 면 아이콘 30종이 운영자가 승인한 정본(스펙 assets/아이콘-30종.json)과 같은지 잠근다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ICON_GLYPHS } from "./icon-glyphs";

const SOURCE: { id: string; svg: string }[] = JSON.parse(
  readFileSync("docs/superpowers/specs/assets/2026-11-09-디자인-다듬기/아이콘-30종.json", "utf8"),
);
const MASKED = ["close_c", "check", "warn", "heart_safe", "bubble", "mail", "palette", "compass", "heart_broken"];

test("30종 이름이 스펙 목록과 같다", () => {
  assert.deepEqual(Object.keys(ICON_GLYPHS).sort(), [
    "back", "bubble", "bulb", "check", "chev_d", "chev_r", "close", "close_c", "clover", "compass",
    "gift", "heart", "heart_broken", "heart_safe", "hearts2", "hourglass", "mail", "palette", "people", "quote",
    "rate_off", "rate_on", "scale", "search", "sparkle", "sprout", "star", "thumb_dn", "thumb_up", "warn",
  ]);
});

test("그림이 정본 JSON 과 같다", () => {
  for (const { id, svg } of SOURCE) {
    const g = ICON_GLYPHS[id as keyof typeof ICON_GLYPHS];
    assert.ok(g, id);
    assert.equal(g.body, svg.replace(/\bm_[a-z]+\b/g, "__ID__"), id);
  }
});

test("별 재화만 고정 색이다", () => {
  assert.equal(ICON_GLYPHS.star.fixedColor, true);
  assert.match(ICON_GLYPHS.star.body, /#E8C26A/);
  assert.match(ICON_GLYPHS.star.body, /#D6A728/);
  for (const [k, v] of Object.entries(ICON_GLYPHS)) if (k !== "star") assert.equal(v.fixedColor, undefined, k);
});

test("mask 를 쓰는 그림은 id 자리표시를 쓴다", () => {
  for (const id of MASKED) {
    const b = ICON_GLYPHS[id as keyof typeof ICON_GLYPHS].body;
    assert.match(b, /__ID__/, id);
    assert.doesNotMatch(b, /\bm_[a-z]+\b/, id);
  }
});
