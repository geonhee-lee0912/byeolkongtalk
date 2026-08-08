import { test } from "node:test";
import assert from "node:assert/strict";
import { readingCategory } from "./category.ts";

const base = { consultationType: undefined, emotionTag: null } as const;

test("타로 상담 → tarot", () => {
  assert.equal(readingCategory({ ...base, consultationType: "tarot" }), "tarot");
});
test("시뮬 → sim", () => {
  assert.equal(readingCategory({ ...base, consultationType: "relationship_sim" }), "sim");
});
test("관계 상담 → relationship", () => {
  assert.equal(readingCategory({ ...base, consultationType: "relationship" }), "relationship");
});
test("운세(emotion_tag=fortune_*) → fortune", () => {
  assert.equal(readingCategory({ ...base, emotionTag: "fortune:daily" }), "fortune");
});
test("사주 상담(fortune 태그 아님) → fortune", () => {
  assert.equal(readingCategory({ ...base, consultationType: "saju" }), "fortune");
});
test("타로맛 운세(consultationType=tarot + fortune emotion_tag) → fortune (tarot 아님)", () => {
  assert.equal(readingCategory({ consultationType: "tarot", emotionTag: "fortune:tarot_love" }), "fortune");
});
