// qa/cases/cases.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { allCases, collectCases } from "./index.ts";

test("사주 파일럿: today_letters 공통 11 케이스", () => {
  const cs = allCases();
  assert.equal(cs.length, 11);
  assert.ok(cs.every((c) => c.id.startsWith("saju.today_letters.")));
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
  assert.equal(collectCases({ caseKey: "crisis" }).length, 1);
  assert.equal(collectCases({ max: 3 }).length, 3);
});
