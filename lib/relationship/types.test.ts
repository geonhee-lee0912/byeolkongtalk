// lib/relationship/types.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PASS_PLAN_BY_KIND, PASS_PLANS, dailyTurnAllowance, DAILY_TURN_CAP,
  SIM_COST, SIM_TURN_CAP,
} from "./types.ts";
import { WELCOME_BONUS_STARS } from "../constants.ts";

test("패스 상품 = 1일30/3일60/7일100", () => {
  assert.equal(PASS_PLAN_BY_KIND.day1.cost, 30);
  assert.equal(PASS_PLAN_BY_KIND.day3.cost, 60);
  assert.equal(PASS_PLAN_BY_KIND.day7.cost, 100);
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

test("SIM_COST 는 웰컴 별 이하라 첫 판을 웰컴 별이 흡수 (스펙 §7)", () => {
  assert.ok(SIM_COST > 0, "SIM_COST 는 양수");
  // 🔴 경계가 < 가 아니라 <= 인 이유: 2026-09-13 웰컴 20→15 로 SIM_COST(15)와 같아졌다.
  //    "흡수"의 의도는 **웰컴으로 첫 판을 살 수 있다**이지 "거스름돈이 남는다"가 아니다.
  //    이 단언이 깨지면 웰컴 별만으로는 시뮬 첫 판을 못 여는 것이니 가격 결정을 다시 볼 것.
  assert.ok(SIM_COST <= WELCOME_BONUS_STARS, `SIM_COST(${SIM_COST}) <= WELCOME_BONUS_STARS(${WELCOME_BONUS_STARS})`);
});

test("SIM_TURN_CAP 은 원가 경계로 유한", () => {
  assert.ok(Number.isInteger(SIM_TURN_CAP) && SIM_TURN_CAP >= 4 && SIM_TURN_CAP <= 30);
});
