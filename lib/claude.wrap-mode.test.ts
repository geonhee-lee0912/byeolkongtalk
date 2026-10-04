import { test } from "node:test";
import assert from "node:assert/strict";
import { computeWrapMode, buildTarotSystemMessage } from "./claude.ts";
import { WRAP_THRESHOLDS } from "./tarot/constants.ts";

const t = WRAP_THRESHOLDS.two_card; // 7/3240/9/3640/12

test("two_card — 6번째 답은 이제 자유 구간(예전 자연 마무리선)", () => {
  assert.equal(computeWrapMode(6, 5000, t).mode, "free");
});

test("two_card — 7번째부터 정리 말투", () => {
  const r = computeWrapMode(7, 3300, t);
  assert.equal(r.mode, "converge");
  assert.equal(r.isLastConvergeTurn, false);
});

test("two_card — 8번째(자연 마무리선−1)는 마지막 수렴 턴", () => {
  const r = computeWrapMode(8, 3300, t);
  assert.equal(r.mode, "converge");
  assert.equal(r.isLastConvergeTurn, true);
});

test("two_card — 9번째 + 글자 충족이면 자연 마무리선", () => {
  const r = computeWrapMode(9, 3700, t);
  assert.equal(r.mode, "hardcap");
  assert.equal(r.absHardcap, false);
});

test("two_card — 12번째는 강제 종료선", () => {
  const r = computeWrapMode(12, 100, t);
  assert.equal(r.mode, "hardcap");
  assert.equal(r.absHardcap, true);
});

test("two_card — 9번째라도 글자 미달이면 자연 마무리선 아님(수렴)", () => {
  assert.equal(computeWrapMode(9, 3639, t).mode, "converge");
});

test("two_card — 7번째라도 글자 미달이면 자유 구간", () => {
  assert.equal(computeWrapMode(7, 3239, t).mode, "free");
});

test("two_card — 8번째(마무리선−1)도 글자 미달이면 자유 구간", () => {
  assert.equal(computeWrapMode(8, 3239, t).mode, "free");
});

test("two_card — 11번째(강제 종료선−1)는 글자 무관 마지막 수렴 턴", () => {
  const r = computeWrapMode(11, 100, t);
  assert.equal(r.mode, "converge");
  assert.equal(r.isLastConvergeTurn, true);
});

const ctxBase = {
  spreadType: "two_card" as const,
  spreadCategory: "love" as const,
  concernText: "그 사람이 다시 연락할까?",
  drawnCards: [
    { position: 0, label: "상황", card_id: 1, direction: "upright" as const },
    { position: 1, label: "조언", card_id: 2, direction: "upright" as const },
  ],
  assistantTurnsSoFar: 8, // 다음 = 9번째 = 자연 마무리선
  cumulativeAssistantChars: 4000,
};

test("buildTarotSystemMessage — 자연 마무리선 + keepOpen 이면 이어가기 가이드, 아니면 기존 마무리 가이드", () => {
  const open = buildTarotSystemMessage({ ...ctxBase, keepOpen: true }).dynamicPart;
  assert.ok(open.includes("## 이어가기 단계"));
  assert.ok(!open.includes("## 마무리 단계"));
  const close = buildTarotSystemMessage({ ...ctxBase, keepOpen: false }).dynamicPart;
  assert.ok(close.includes("## 마무리 단계"));
});

test("buildTarotSystemMessage — clarifierCandidate 일 때만 '한 장 더' 판단 지시", () => {
  const c = { ...ctxBase, assistantTurnsSoFar: 2, cumulativeAssistantChars: 1500 };
  assert.ok(buildTarotSystemMessage({ ...c, clarifierCandidate: true }).dynamicPart.includes("'카드 한 장 더' 제안 판단"));
  assert.ok(!buildTarotSystemMessage({ ...c, clarifierCandidate: false }).dynamicPart.includes("'카드 한 장 더' 제안 판단"));
});
