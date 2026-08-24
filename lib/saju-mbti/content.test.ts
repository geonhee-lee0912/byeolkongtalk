import { test } from "node:test";
import assert from "node:assert/strict";
import { TYPE_CONTENT, ELEMENT_MODULE, MATCH_NARRATIVE } from "./content.ts";
import { ALL_CODES } from "./codes.ts";

const CODES = new Set(ALL_CODES);
const nonEmpty = (s: unknown) => typeof s === "string" && s.trim().length > 0;
const FIELDS = ["hanja", "character", "memeSubtitle", "oneLiner", "personality", "light", "shadow", "love", "shareText"] as const;

test("content — 각 유형 칸 채움·궁합 코드 유효", () => {
  for (const [code, c] of Object.entries(TYPE_CONTENT)) {
    assert.ok(CODES.has(code), `무효 코드 키 ${code}`);
    for (const f of FIELDS) assert.ok(nonEmpty(c[f]), `${code}.${f} 비어있음`);
    assert.ok(c.compat.fits.length >= 1 && c.compat.fits.length <= 2, `${code} fits 1~2 아님`);
    assert.ok(c.compat.clashes.length >= 1, `${code} clashes 없음`);
    for (const e of [...c.compat.fits, ...c.compat.clashes]) {
      assert.ok(CODES.has(e.code), `${code} 궁합 무효코드 ${e.code}`);
      assert.ok(nonEmpty(e.reason), `${code}→${e.code} reason 비어있음`);
    }
  }
});

test("content — 오행 5개(목화토금수) texture 채움", () => {
  for (const el of ["목", "화", "토", "금", "수"] as const)
    assert.ok(nonEmpty(ELEMENT_MODULE[el]?.texture), `${el} texture 비어있음`);
});

test("content — 일치율 밴드 3개 title·body 채움", () => {
  for (const b of ["천명", "절충", "거스름"] as const) {
    assert.ok(nonEmpty(MATCH_NARRATIVE[b]?.title), `${b} title`);
    assert.ok(nonEmpty(MATCH_NARRATIVE[b]?.body), `${b} body`);
  }
});

test("content — 16유형 전부 커버(ALL_CODES 완결)", () => {
  assert.deepEqual(new Set(Object.keys(TYPE_CONTENT)), CODES);
});
