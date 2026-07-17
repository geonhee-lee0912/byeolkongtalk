// qa/cases/cases.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { allCases, collectCases } from "./index.ts";

test("전체 케이스 카운트: 사주 46 + 타로 50 = 96", () => {
  // 사주: today_letters 11, nature 11, choice 12, good_days 12 = 46
  // 타로: one 11, two 11, three 13(more_cards·timing_push 포함), relationship_5 11,
  //      W1 신설 4(reunion_deep_7·checkin_6·stay_or_go_6·chakra_7) = 50
  assert.equal(allCases().length, 96);
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
  assert.equal(collectCases({ caseKey: "crisis" }).length, 8);
  assert.equal(collectCases({ max: 3 }).length, 3);
});
