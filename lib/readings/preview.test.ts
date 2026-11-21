import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPreview } from "./preview.ts";

test("buildPreview — 굵게 표시 별표(**)는 미리보기에서 뺀다(보관함에 '**' 가 그대로 보였다, 디자인 다듬기 보관함 ⑥)", () => {
  assert.equal(buildPreview("지금은 **빠른 판단과 현실적인 일정** 사이야"), "지금은 빠른 판단과 현실적인 일정 사이야");
});

test("buildPreview — 카드·종료·추천 마커 제거와 90자 절단은 그대로", () => {
  assert.equal(buildPreview("[CARD:3] 안녕 [END]"), "안녕");
  assert.equal(buildPreview("좋아 [RECO:saju_full]"), "좋아");
  const long = "가".repeat(95);
  assert.equal(buildPreview(long), "가".repeat(90) + "…");
});

test("buildPreview — 리포트(JSON)는 summary 같은 글 필드를 쓴다", () => {
  assert.equal(buildPreview(JSON.stringify({ v: 1, summary: "올해는 **천천히**" })), "올해는 천천히");
});
