import { test } from "node:test";
import assert from "node:assert/strict";
import { starTxLabel, historyDayLabel } from "./wallet-history.ts";

test("starTxLabel — 별을 어디에 썼는지(디자인 다듬기 결제 내역 ⑨, 예전엔 전부 '사용')", () => {
  assert.equal(starTxLabel("spend", "tarot_reading"), "타로 상담");
  assert.equal(starTxLabel("spend", "saju_reading"), "사주 상담");
  assert.equal(starTxLabel("spend", "clarifier"), "카드 한 장 더");
  assert.equal(starTxLabel("spend", "extend"), "별콩이랑 더 얘기하기");
  assert.equal(starTxLabel("spend", "fortune_saju_full"), "2026년 사주 분석");
  assert.equal(starTxLabel("spend", "fortune_compat"), "사랑하는 사람과의 궁합 분석");
  assert.equal(starTxLabel("spend", "relationship_pass"), "우리 사이");
  assert.equal(starTxLabel("spend", "rel_skill_verdict"), "우리 사이");
  assert.equal(starTxLabel("charge", "pg"), "별 충전");
  assert.equal(starTxLabel("charge", "welcome_bonus"), "첫 방문 선물");
  assert.equal(starTxLabel("charge", "first_charge_bonus"), "첫 충전 보너스");
  assert.equal(starTxLabel("charge", "survey_reward"), "설문 선물");
  assert.equal(starTxLabel("refund", "pg"), "환불");
});

test("starTxLabel — 모르는 값은 원문이 아니라 일반 이름(내부 코드를 화면에 내지 않는다, 크래시도 없다)", () => {
  assert.equal(starTxLabel("spend", "fortune_no_such_type"), "사주 운세");
  assert.equal(starTxLabel("spend", "fortune_constructor"), "사주 운세");
  assert.equal(starTxLabel("spend", "something_new"), "별 사용");
  assert.equal(starTxLabel("spend", null), "별 사용");
  assert.equal(starTxLabel("charge", "something_new"), "별 받음");
  assert.equal(starTxLabel("bonus", null), "보너스");
});

test("historyDayLabel — 올해는 'M월 D일', 다른 해는 연도까지", () => {
  const now = new Date(2026, 10, 22, 9).getTime();
  assert.equal(historyDayLabel(new Date(2026, 10, 21, 10, 59).getTime(), now), "11월 21일");
  assert.equal(historyDayLabel(new Date(2025, 11, 31, 23).getTime(), now), "2025년 12월 31일");
});
