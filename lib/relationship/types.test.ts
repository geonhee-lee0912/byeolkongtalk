// lib/relationship/types.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PASS_PLAN_BY_KIND, PASS_PLANS, dailyTurnAllowance, DAILY_TURN_CAP,
} from "./types.ts";

test("패스 상품 = 1일20/3일40/7일60", () => {
  assert.equal(PASS_PLAN_BY_KIND.day1.cost, 20);
  assert.equal(PASS_PLAN_BY_KIND.day3.cost, 40);
  assert.equal(PASS_PLAN_BY_KIND.day7.cost, 60);
  assert.equal(PASS_PLAN_BY_KIND.day7.days, 7);
  assert.equal(PASS_PLANS.filter((p) => p.recommended).length, 0); // 추천 뱃지 제거됨
});

test("일일 허용 = 20 + 5*연장횟수", () => {
  assert.equal(dailyTurnAllowance(0), DAILY_TURN_CAP);
  assert.equal(dailyTurnAllowance(1), 25);
  assert.equal(dailyTurnAllowance(3), 35);
  assert.equal(dailyTurnAllowance(-1), 20); // 방어
});

test("PASS_PLANS 라벨은 시간권(일 병기) 표기", () => {
  const byKind = Object.fromEntries(PASS_PLANS.map((p) => [p.kind, p.label]));
  assert.equal(byKind.day1, "24시간(1일)");
  assert.equal(byKind.day3, "72시간(3일)");
  assert.equal(byKind.day7, "168시간(7일)");
});
