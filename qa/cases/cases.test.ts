// qa/cases/cases.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { allCases, collectCases } from "./index.ts";

test("전체 케이스 카운트: 사주 46 + 타로 44 = 90", () => {
  // 사주: today_letters 11, nature 11, choice 11+1, good_days 11+1 = 46
  // 타로: 4 스프레드 × 11 = 44
  assert.equal(allCases().length, 90);
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
