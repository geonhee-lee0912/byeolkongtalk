import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_CODES } from "./codes.ts";
import { POLES } from "./constants.ts";

test("ALL_CODES — 16개·유일·4자·유효 극", () => {
  assert.equal(ALL_CODES.length, 16);
  assert.equal(new Set(ALL_CODES).size, 16);
  const valid = new Set<string>(Object.values(POLES).flat());
  for (const c of ALL_CODES) {
    assert.equal([...c].length, 4, `${c} 4자 아님`);
    for (const ch of c) assert.ok(valid.has(ch), `${c} 무효 극 ${ch}`);
  }
});

test("ALL_CODES — 축 순서(음양·강유·재인·생단)로 조립", () => {
  assert.ok(ALL_CODES.includes("양강재생"));
  assert.ok(ALL_CODES.includes("음유인생"));
  assert.equal(ALL_CODES[0], "양강재생"); // 각 축 front 우선
});
