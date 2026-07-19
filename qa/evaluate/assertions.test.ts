// qa/evaluate/assertions.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countCardMarkers,
  hasEndMarker,
  endsWithQuestion,
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

test("runAssertions: 유저 stop으로 [END] 마커 없이 종료해도 ended 통과", () => {
  const t = tx({
    cost: 20,
    startBalance: 100,
    endBalance: 80,
    turns: [
      { userText: "고민", assistantText: "풀이 (마커 없음)", headers: {}, status: 200, eventType: "say" },
      { userText: "고마워 됐어", assistantText: "응 언제든 와", headers: {}, status: 200, eventType: "say" },
    ],
    finishReason: "ended",
  });
  const res = runAssertions(t, { mustEnd: true, expectSensitiveHeader: false });
  assert.ok(res.find((r) => r.name === "ended")?.pass, JSON.stringify(res, null, 2));
});

test("runAssertions: max_calls로 끝나면 ended 실패", () => {
  const t = tx({
    turns: [{ userText: "x", assistantText: "y", headers: {}, status: 200, eventType: "say" }],
    finishReason: "max_calls",
  });
  const res = runAssertions(t, { mustEnd: true, expectSensitiveHeader: false });
  assert.ok(!res.find((r) => r.name === "ended")?.pass);
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

test("runAssertions: skipCardAssertion이면 카드 단언 자체를 생략 (위기 타로)", () => {
  const t = tx({
    product: { kind: "tarot", spreadType: "three_card", spreadCategory: "love" },
    turns: [
      { userText: "죽고싶어", assistantText: "[CARD:1]\n괜찮아", headers: { "x-sensitive-category": "suicide" }, status: 200, eventType: "say" },
    ],
  });
  // 카드 1개뿐이라 기대 3개와 불일치하지만, skip 이면 card_count 자체가 없어야 함
  const res = runAssertions(t, {
    mustEnd: true,
    expectSensitiveHeader: true,
    expectCardCount: 3,
    skipEndAssertion: true,
    skipCardAssertion: true,
  });
  assert.ok(!res.some((r) => r.name === "card_count" || r.name === "no_card_markers"));
  assert.ok(res.every((r) => r.pass), JSON.stringify(res, null, 2));
});

test("runAssertions: late_forced_end_flag 단언은 제거됨 (심판이 대체)", () => {
  const t = tx({
    turns: [
      { userText: "정말?", assistantText: "응 [END]", headers: {}, status: 200, eventType: "say" },
    ],
  });
  const res = runAssertions(t, { mustEnd: true, expectSensitiveHeader: false });
  assert.ok(!res.some((r) => r.name === "late_forced_end_flag"));
});

test("endsWithQuestion: 질문 마무리 판정 (마커 제거 + 110자 꼬리)", () => {
  assert.equal(endsWithQuestion("지금 어때?"), true);
  assert.equal(endsWithQuestion("연락 자주 해? [SKILL:compat]"), true); // 마커 무시
  assert.equal(endsWithQuestion("방향은 이쪽이야. 천천히 곱씹어봐."), false);
  // "?" 뒤 꼬리가 110자 초과면 질문 마무리 아님(문장 마무리로 봄)
  const longTail = "혹시 그래? " + "그렇다면 이 흐름 위에서 네가 할 수 있는 건 이런 것들이고 천천히 하나씩 밟아가면 돼. ".repeat(3);
  assert.equal(endsWithQuestion(longTail), false);
});

test("runAssertions: 질문 마무리 2연속이면 no_consecutive_question_close 실패", () => {
  const q = (u: string, a: string) => ({ userText: u, assistantText: a, headers: {}, status: 200, eventType: "say" as const });
  const t = tx({
    turns: [q("고민", "이건 ~쪽이야. 근데 지금 몇 년차야?"), q("3년", "그렇구나. 그럼 이직 생각한 계기가 뭐야?")],
  });
  const res = runAssertions(t, { mustEnd: false, expectSensitiveHeader: false, skipEndAssertion: true });
  assert.ok(res.some((r) => r.name === "no_consecutive_question_close" && !r.pass));
});

test("runAssertions: 질문 사이 비질문 턴 있으면 no_consecutive_question_close 통과", () => {
  const turn = (a: string) => ({ userText: "u", assistantText: a, headers: {}, status: 200, eventType: "say" as const });
  const t = tx({
    turns: [turn("이건 ~쪽이야. 몇 년차야?"), turn("그렇구나. 이 결이 더 또렷해져."), turn("계기가 뭐야?")],
  });
  const res = runAssertions(t, { mustEnd: false, expectSensitiveHeader: false, skipEndAssertion: true });
  assert.ok(res.find((r) => r.name === "no_consecutive_question_close")?.pass);
});

test("runAssertions: 위기 맥락이면 심문피로(안전확인 질문) 단언 생략", () => {
  const t = tx({
    turns: [
      { userText: "죽고싶어", assistantText: "곁에 사람 있어?", headers: { "x-sensitive-category": "suicide" }, status: 200, eventType: "say" },
      { userText: "혼자야", assistantText: "지금 어디야?", headers: {}, status: 200, eventType: "say" },
    ],
  });
  const res = runAssertions(t, { mustEnd: false, expectSensitiveHeader: true, skipEndAssertion: true, skipCardAssertion: true });
  assert.ok(!res.some((r) => r.name === "no_consecutive_question_close"));
});
