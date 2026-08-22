import { test } from "node:test";
import assert from "node:assert/strict";
import { calcSaju } from "../saju/calc.ts";
import { dayType } from "./day-type.ts";

test("dayType — 계절+유형 결합", () => {
  assert.equal(dayType("신", "오"), "여름 보석형");
  assert.equal(dayType("무", "인"), "봄 큰산형");
  assert.equal(dayType("갑", "자"), "겨울 큰나무형");
  assert.equal(dayType("경", "유"), "가을 원석형");
});

test("dayType — 미지 폴백", () => {
  assert.equal(dayType("?", "오"), "여름 별 유형");
  assert.equal(dayType("신", "?"), "보석형");
});

test("dayType — 실제 calcSaju 출력으로 키 포맷 검증(폴백 아님)", () => {
  const r = calcSaju({ year: 1990, month: 6, day: 15, hour: 10, minute: 0, gender: "other" });
  assert.equal(dayType(r.dayStem, r.pillars.month.branch), "여름 보석형");
});
