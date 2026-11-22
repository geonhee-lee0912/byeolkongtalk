// qa/cases/cases.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { allCases, collectCases } from "./index.ts";

test("전체 케이스 카운트: 사주 46 + 타로 51 + 고민톡 6 + 관계 13 + 관계love 6 + verdict 2 = 124", () => {
  // 사주: today_letters 11, nature 11, choice 12, good_days 12 = 46
  // 타로: one 11, two 11, three 13(more_cards·timing_push 포함), relationship_5 11,
  //      W1 신설 4(reunion_deep_7·checkin_6·stay_or_go_6·chakra_7) +
  //      P1 검증 reunion_deep_7.timing_push 1 = 51
  // 고민톡(실측 그라운디드) 6 (tarot.real.*)
  // 관계 스레드 13(shared 11 + pass_gate + daily_close) + 관계 love 6(relationship.love.*) + verdict 2
  assert.equal(allCases().length, 124);
});

test("crisis 케이스는 sensitive 헤더 기대", () => {
  const c = allCases().find((x) => x.id.endsWith(".crisis"))!;
  assert.equal(c.expects.expectSensitiveHeader, true);
});

test("abandon 케이스는 mustEnd=false", () => {
  const c = allCases().find((x) => x.id.endsWith(".abandon"))!;
  assert.equal(c.expects.mustEnd, false);
});

test("collectCases 필터: product + caseKey", () => {
  assert.equal(collectCases({ product: "saju:today_letters" }).length, 11);
  // crisis: 사주 4 + 타로 4 = 8 (관계 스레드 1 은 종료로 기본 제외)
  assert.equal(collectCases({ caseKey: "crisis" }).length, 8);
  assert.equal(collectCases({ max: 3 }).length, 3);
});

test("collectCases caseKey 콤마 OR (집중 실행 필터)", () => {
  const real = collectCases({ caseKey: "real" }).length; // 고민톡 6
  const picks = collectCases({ caseKey: "date_pick" }).length; // 좋은 날 특화 1
  assert.equal(real, 6);
  assert.equal(picks, 1);
  // 콤마 OR = 합집합 (id 중복 없음)
  assert.equal(collectCases({ caseKey: "real,date_pick" }).length, real + picks);
});

test("연애 상담·판정은 종료돼 기본 실행에서 빠진다 — 사주·타로 103", () => {
  const cases = collectCases({});
  assert.equal(cases.length, 103);
  assert.deepEqual([...new Set(cases.map((c) => c.product.kind))].sort(), ["saju", "tarot"]);
  assert.equal(collectCases({ caseKey: "love" }).length, 0);
});

test("연애 상담·판정은 --product 로 콕 집으면 나온다", () => {
  assert.equal(collectCases({ product: "relationship" }).length, 19);
  assert.equal(collectCases({ product: "verdict" }).length, 2);
});
