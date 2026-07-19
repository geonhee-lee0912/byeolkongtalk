// qa/cases/cases.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { allCases, collectCases } from "./index.ts";

test("전체 케이스 카운트: 사주 46 + 타로 50 + 고민톡 6 + 관계 13 + 관계love 6 + verdict 2 = 123", () => {
  // 사주: today_letters 11, nature 11, choice 12, good_days 12 = 46
  // 타로: one 11, two 11, three 13(more_cards·timing_push 포함), relationship_5 11,
  //      W1 신설 4(reunion_deep_7·checkin_6·stay_or_go_6·chakra_7) = 50
  // 고민톡(실측 그라운디드) 6 (tarot.real.*)
  // 관계 스레드 13(shared 11 + pass_gate + daily_close) + 관계 love 6(relationship.love.*) + verdict 2
  assert.equal(allCases().length, 123);
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
  // crisis: 사주 4 + 타로 4 + 관계 스레드 1 = 9
  assert.equal(collectCases({ caseKey: "crisis" }).length, 9);
  assert.equal(collectCases({ max: 3 }).length, 3);
});

test("collectCases caseKey 콤마 OR (집중 실행 필터)", () => {
  const real = collectCases({ caseKey: "real" }).length; // 고민톡 6
  const love = collectCases({ caseKey: "love" }).length; // 관계 love 6
  assert.equal(real, 6);
  assert.equal(love, 6);
  // 콤마 OR = 합집합 (id 중복 없음)
  assert.equal(collectCases({ caseKey: "real,love" }).length, real + love);
});
