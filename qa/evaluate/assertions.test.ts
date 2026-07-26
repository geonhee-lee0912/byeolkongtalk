// qa/evaluate/assertions.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countCardMarkers,
  hasEndMarker,
  endsWithQuestion,
  lastAssistantText,
  runAssertions,
  findCardNamesBeforeMarker,
  findMissingCardSkeleton,
  firstTurnLengthBelowMin,
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

// ── P1-5: 카드 이름 마커 선행 금지 ──

test("findCardNamesBeforeMarker: 훅에서 카드 이름을 마커보다 먼저 언급하면 위반 (실제 P1-5 버그 재현)", () => {
  // three_card = card_id 0,1,2 = 바보(일반어 스킵),마법사,여교황 → 마법사([CARD:2])로 재현.
  const text =
    "이 판 전체엔 마법사 카드의 기운이 흐르고 있어.\n\n[CARD:1]\n첫 카드 해석.\n\n[CARD:2]\n마법사 카드는 시작의 힘이야.";
  const r = findCardNamesBeforeMarker(text, "three_card");
  assert.equal(r.violations.length, 1, JSON.stringify(r));
  assert.ok(r.violations[0].includes("마법사"));
});

test("findCardNamesBeforeMarker: 마커 뒤에서만 이름을 언급하면 통과", () => {
  const text =
    "전체적으로 새로운 시작의 기운이 느껴져.\n\n[CARD:1]\n첫 카드 해석.\n\n[CARD:2]\n마법사 카드는 시작의 힘이야.";
  const r = findCardNamesBeforeMarker(text, "three_card");
  assert.equal(r.violations.length, 0, JSON.stringify(r));
  assert.deepEqual(r.checked, ["마법사"]); // 검사가 실제로 일어났음(무의미한 통과가 아님)
});

test("findCardNamesBeforeMarker: 마커 자체가 없는 카드는 건너뜀(card_count 단언 몫) — checked 에도 안 들어감", () => {
  const text = "그냥 산문. 마법사 이름은 있는데 마커가 없음.";
  const r = findCardNamesBeforeMarker(text, "three_card");
  assert.equal(r.violations.length, 0, JSON.stringify(r));
  assert.equal(r.checked.length, 0);
});

test("findCardNamesBeforeMarker: 일반어 카드명(바보·연인)은 마커보다 먼저 나와도 위반 아님 + skipped 로 보고", () => {
  // reunion_deep_7 = card_id 0..6 → 바보(0)·연인(6)이 일반어 스킵 대상.
  // 아래 훅 문장은 카드 참조가 아니라 순수 일상어인데, 스킵 없으면 둘 다 위반으로 잡힌다.
  const text =
    "요즘 스스로 바보 같다고 느낀다고 했지. 연인 사이의 거리도 멀어졌고.\n\n" +
    "[CARD:1]\n첫 해석.\n[CARD:2]\n마법사 해석.\n[CARD:3]\n여교황 해석.\n" +
    "[CARD:4]\n여황제 해석.\n[CARD:5]\n황제 해석.\n[CARD:6]\n교황 해석.\n[CARD:7]\n마지막 해석.";
  const r = findCardNamesBeforeMarker(text, "reunion_deep_7");
  assert.equal(r.violations.length, 0, JSON.stringify(r));
  assert.deepEqual(r.skipped, ["바보", "연인"]);
  // 나머지 5장은 여전히 실검사 대상 — 스킵 목록이 단언을 통째로 무력화하지 않는다는 확인.
  assert.deepEqual(r.checked, ["마법사", "여교황", "여황제", "황제", "교황"]);
});

test("findCardNamesBeforeMarker: '여황제'⊃'황제' 부분 문자열 오탐 방지 (5장 이상 스프레드는 항상 두 이름을 함께 뽑음)", () => {
  // relationship_5: card_id 0..4 = 바보,마법사,여교황,여황제,황제.
  // 가드 없이 순수 indexOf만 쓰면 "황제"([CARD:5])가 앞서 나온 "여황제"([CARD:4]) 안의 부분
  // 문자열에 걸려 100% 오탐한다 — 이 테스트가 그 가드가 실제로 동작하는지 확인한다.
  const text = [
    "훅.",
    "[CARD:1]\n바보 해석.",
    "[CARD:2]\n마법사 해석.",
    "[CARD:3]\n여교황 해석.",
    "[CARD:4]\n여황제 해석.",
    "[CARD:5]\n황제 해석.",
  ].join("\n");
  const r = findCardNamesBeforeMarker(text, "relationship_5");
  assert.equal(r.violations.length, 0, JSON.stringify(r));
  assert.ok(r.checked.includes("황제"), "황제가 실제 검사 대상이어야 가드가 의미 있음");
});

// ── P1-4: 프리미엄 카드별 3라벨 골격 ──

test("findMissingCardSkeleton: 3라벨이 순서대로 다 있으면 통과", () => {
  const text =
    "[CARD:1]\n🃏 카드가 말하는 것: 설명.\n💫 너의 상황에서는 (포지션): 설명.\n🔗 흐름 연결: 설명.\n\n[CARD:2]\n🃏 카드가 말하는 것: 설명.\n💫 너의 상황에서는 (포지션): 설명.\n🔗 흐름 연결: 설명.";
  assert.equal(findMissingCardSkeleton(text).length, 0);
});

test("findMissingCardSkeleton: 라벨이 하나라도 빠지면 그 카드만 위반", () => {
  const text =
    "[CARD:1]\n그냥 산문으로만 풀이해서 라벨이 없음.\n\n[CARD:2]\n🃏 카드가 말하는 것: 설명.\n💫 너의 상황에서는 (포지션): 설명.\n🔗 흐름 연결: 설명.";
  const v = findMissingCardSkeleton(text);
  assert.equal(v.length, 1);
  assert.ok(v[0].includes("[CARD:1]"));
});

test("findMissingCardSkeleton: 라벨 순서가 뒤바뀌면 위반", () => {
  const text = "[CARD:1]\n🔗 흐름 연결: 설명.\n💫 너의 상황에서는 (포지션): 설명.\n🃏 카드가 말하는 것: 설명.";
  assert.equal(findMissingCardSkeleton(text).length, 1);
});

// ── P1-4: 첫 턴 분량 하한 ──

test("firstTurnLengthBelowMin: 하한 미달이면 below=true", () => {
  const r = firstTurnLengthBelowMin("짧은 텍스트", 7);
  assert.equal(r.below, true);
});

test("firstTurnLengthBelowMin: 마커 제외한 글자수로 판정 (마커 길이는 하한에 안 보탬)", () => {
  const body = "가".repeat(3300);
  const r = firstTurnLengthBelowMin(`[CARD:1]${body}[END]`, 7);
  assert.equal(r.below, false);
});

test("firstTurnLengthBelowMin: 정의 안 된 카드 수는 n/a로 통과 처리(below=false)", () => {
  const r = firstTurnLengthBelowMin("짧음", 4);
  assert.equal(r.below, false);
  assert.ok(r.detail.includes("n/a"));
});

// ── runAssertions 통합 배선 확인 ──

test("runAssertions: 프리미엄(7장) 첫 턴 훅에 카드 이름이 마커보다 먼저 나오면 card_name_before_marker 실패", () => {
  const t = tx({
    product: { kind: "tarot", spreadType: "reunion_deep_7", spreadCategory: "love" },
    turns: [
      {
        userText: "고민",
        assistantText:
          "마법사 카드의 기운이 느껴져.\n\n[CARD:1]\n첫 해석.\n[CARD:2]\n마법사 카드는 시작의 힘이야.",
        headers: {},
        status: 200,
        eventType: "say",
      },
    ],
  });
  const res = runAssertions(t, {
    mustEnd: false,
    expectSensitiveHeader: false,
    expectCardCount: 7,
    skipEndAssertion: true,
  });
  const hit = res.find((r) => r.name === "card_name_before_marker");
  assert.ok(hit && !hit.pass, JSON.stringify(res, null, 2));
  // 실패 메시지가 "무엇을 검사했는지"까지 담아야 배포일에 커버리지를 읽을 수 있다.
  assert.ok(hit!.detail.includes("검사"), hit!.detail);
  assert.ok(hit!.detail.includes("일반어 스킵"), hit!.detail);
});

test("runAssertions: 통과 메시지도 검사 범위를 노출한다 (깨끗한 통과 vs 전부 스킵 구분)", () => {
  const t = tx({
    product: { kind: "tarot", spreadType: "three_card", spreadCategory: "love" },
    turns: [
      {
        userText: "고민",
        assistantText: "훅.\n\n[CARD:1]\n첫 해석.\n[CARD:2]\n마법사 해석.\n[CARD:3]\n여교황 해석. [END]",
        headers: {},
        status: 200,
        eventType: "say",
      },
    ],
  });
  const res = runAssertions(t, { mustEnd: true, expectSensitiveHeader: false, expectCardCount: 3 });
  const hit = res.find((r) => r.name === "card_name_before_marker");
  assert.ok(hit?.pass, JSON.stringify(res, null, 2));
  assert.ok(hit!.detail.includes("마법사") && hit!.detail.includes("여교황"), hit!.detail);
});

test("runAssertions: 검사 대상이 0장이면 통과라도 '무의미'라고 표기 (원카드=바보 한 장, 전부 일반어 스킵)", () => {
  const t = tx({
    product: { kind: "tarot", spreadType: "one_card", spreadCategory: "worry" },
    turns: [
      { userText: "고민", assistantText: "훅.\n\n[CARD:1]\n바보 카드 해석. [END]", headers: {}, status: 200, eventType: "say" },
    ],
  });
  const res = runAssertions(t, { mustEnd: true, expectSensitiveHeader: false, expectCardCount: 1 });
  const hit = res.find((r) => r.name === "card_name_before_marker");
  assert.ok(hit?.pass);
  assert.ok(hit!.detail.includes("무의미"), hit!.detail);
});

test("runAssertions: 5장 미만 스프레드는 premium_card_skeleton/premium_first_turn_length 단언 자체가 없음", () => {
  const t = tx({
    product: { kind: "tarot", spreadType: "one_card", spreadCategory: "worry" },
    turns: [
      { userText: "고민", assistantText: "훅.\n\n[CARD:1]\n바보 카드 해석. [END]", headers: {}, status: 200, eventType: "say" },
    ],
  });
  const res = runAssertions(t, { mustEnd: true, expectSensitiveHeader: false, expectCardCount: 1 });
  assert.ok(!res.some((r) => r.name === "premium_card_skeleton" || r.name === "premium_first_turn_length"));
});

test("runAssertions: skipCardAssertion이면 P1-5/P1-4 단언도 전부 생략", () => {
  const t = tx({
    product: { kind: "tarot", spreadType: "reunion_deep_7", spreadCategory: "love" },
    turns: [
      { userText: "죽고싶어", assistantText: "괜찮아", headers: { "x-sensitive-category": "suicide" }, status: 200, eventType: "say" },
    ],
  });
  const res = runAssertions(t, {
    mustEnd: true,
    expectSensitiveHeader: true,
    expectCardCount: 7,
    skipEndAssertion: true,
    skipCardAssertion: true,
  });
  assert.ok(
    !res.some((r) =>
      ["card_name_before_marker", "premium_card_skeleton", "premium_first_turn_length"].includes(r.name)
    )
  );
});
