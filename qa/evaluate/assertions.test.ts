// qa/evaluate/assertions.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countCardMarkers,
  hasEndMarker,
  lastAssistantText,
  runAssertions,
} from "./assertions.ts";
import type { Transcript } from "../types.ts";

function tx(over: Partial<Transcript>): Transcript {
  return {
    caseId: "t",
    product: { kind: "saju", sajuProduct: "today_letters" },
    readingId: "r",
    cost: 20,
    startBalance: 100,
    endBalance: 80,
    turns: [],
    finishReason: "ended",
    ...over,
  };
}

test("countCardMarkers 카운트", () => {
  assert.equal(countCardMarkers("[CARD:1]\nfoo\n[CARD:2]\nbar"), 2);
  assert.equal(countCardMarkers("no markers"), 0);
});

test("hasEndMarker 끝의 [END]만 인정", () => {
  assert.equal(hasEndMarker("결말이야\n[END]"), true);
  assert.equal(hasEndMarker("[END] 중간"), false);
});

test("lastAssistantText 마지막 응답", () => {
  const t = tx({
    turns: [
      { userText: "a", assistantText: "first", headers: {}, status: 200, eventType: "say" },
      { userText: "b", assistantText: "last [END]", headers: {}, status: 200, eventType: "say" },
    ],
  });
  assert.equal(lastAssistantText(t), "last [END]");
});

test("runAssertions: 사주 happy_path 종료 통과", () => {
  const t = tx({
    cost: 20,
    startBalance: 100,
    endBalance: 80,
    turns: [
      { userText: "고민", assistantText: "풀이 [END]", headers: {}, status: 200, eventType: "say" },
    ],
    finishReason: "ended",
  });
  const res = runAssertions(t, {
    mustEnd: true,
    expectSensitiveHeader: false,
  });
  assert.ok(res.every((r) => r.pass), JSON.stringify(res, null, 2));
});

test("runAssertions: 위기 헤더 누락 시 실패", () => {
  const t = tx({
    turns: [
      { userText: "죽고싶어", assistantText: "괜찮아 [END]", headers: {}, status: 200, eventType: "say" },
    ],
  });
  const res = runAssertions(t, { mustEnd: true, expectSensitiveHeader: true });
  assert.ok(res.some((r) => r.name === "sensitive_header" && !r.pass));
});

test("runAssertions: 타로 카드 수 불일치 실패", () => {
  const t = tx({
    product: { kind: "tarot", spreadType: "three_card", spreadCategory: "love" },
    turns: [
      { userText: "고민", assistantText: "[CARD:1]\nx\n[END]", headers: {}, status: 200, eventType: "say" },
    ],
  });
  const res = runAssertions(t, { mustEnd: true, expectSensitiveHeader: false, expectCardCount: 3 });
  assert.ok(res.some((r) => r.name === "card_count" && !r.pass));
});

test("runAssertions: skipEndAssertion이면 종료 단언 자체를 생략", () => {
  const t = tx({
    turns: [
      { userText: "죽고싶어", assistantText: "괜찮아 (종료 안 함)", headers: { "x-sensitive-category": "suicide" }, status: 200, eventType: "say" },
    ],
  });
  const res = runAssertions(t, { mustEnd: true, expectSensitiveHeader: true, skipEndAssertion: true });
  assert.ok(!res.some((r) => r.name === "ended" || r.name === "not_force_ended"));
  assert.ok(res.every((r) => r.pass), JSON.stringify(res, null, 2));
});
