import { test } from "node:test";
import assert from "node:assert/strict";
import { SPREAD_INFO, type SpreadType } from "./spreads.ts";
import { WRAP_THRESHOLDS } from "./constants.ts";
import { followUpQuestions, spreadAmountLine } from "./spread-facts.ts";

const ALL = Object.keys(SPREAD_INFO) as SpreadType[];

test("spreadAmountLine — 카드 수별 줄 (spec 2026-10-25 §5)", () => {
  const expected: Array<[SpreadType, string]> = [
    ["one_card", "첫 풀이 ~800자 · 질문 4번 이상"],
    ["two_card", "첫 풀이 ~1,200자 · 질문 5번 이상"],
    ["three_card", "첫 풀이 ~2,000자 · 질문 9번 이상"],
    ["relationship_5", "첫 풀이 ~3,500자 · 질문 12번 이상"],
    ["checkin_6", "첫 풀이 ~3,800자 · 질문 14번 이상"],
    ["potential_7", "첫 풀이 ~4,700자 · 질문 16번 이상"],
  ];
  for (const [s, line] of expected) assert.equal(spreadAmountLine(s), line, s);
});

test("spreadAmountLine — 스프레드 14종 전부 줄이 나온다(새 카드 수가 분량 표에 없으면 여기서 잡힌다)", () => {
  assert.equal(ALL.length, 14); // 목록이 비어 통과하는 것을 막는다
  for (const s of ALL) {
    assert.doesNotThrow(() => spreadAmountLine(s), s);
    assert.match(spreadAmountLine(s), /^첫 풀이 ~[\d,]+자 · 질문 \d+번 이상$/, s);
  }
});

test("followUpQuestions — 자연 마무리선 답 번호 − 1(첫 풀이가 1번째 답) — 임계치를 바꾸면 화면이 따라간다", () => {
  for (const s of ALL) {
    assert.equal(followUpQuestions(s), WRAP_THRESHOLDS[s].hardCapTurn - 1, s);
    assert.ok(followUpQuestions(s) >= 1, s);
  }
});
