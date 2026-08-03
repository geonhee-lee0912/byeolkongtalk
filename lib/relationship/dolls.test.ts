import { test } from "node:test";
import assert from "node:assert/strict";
import { MBTI_OPTIONS, DOLL_COLORS } from "./types";

test("MBTI 16개", () => assert.equal(MBTI_OPTIONS.length, 16));

test("모든 관계 상태에 인형 색", () => {
  for (const s of ["crush", "dating", "breakup", "onesided"] as const)
    assert.ok(DOLL_COLORS[s], `누락: ${s}`);
});
