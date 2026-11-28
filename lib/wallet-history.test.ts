import { test } from "node:test";
import assert from "node:assert/strict";
import { starTxLabel, historyDayLabel, mergeHistory, starTxSignedAmount, isHiddenStarTx } from "./wallet-history.ts";

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

test("starTxLabel — 운세 실패 환불은 '별 돌려받음'", () => {
  assert.equal(starTxLabel("charge", "fortune_refund_monthly"), "별 돌려받음");
  assert.equal(starTxLabel("charge", "rel_skill_compat_refund"), "별 돌려받음");
});

const pay = (id: string, t: number, status: "pending" | "completed" | "refunded" = "completed") => ({
  id, packageLabel: "70별 패키지", stars: 70, amount: 5900, status, paidAt: t,
});
const tx = (id: string, t: number, type: string, source: string, paymentId: string | null, amount = 70) => ({
  id, type, typeLabel: "", signedAmount: type === "spend" ? -amount : amount, balanceAfter: 100, source, paymentId, createdAt: t,
});

test("mergeHistory — 결제 1번이 '결제' 줄 + '별 충전' 줄 두 줄로 보이던 것을 한 줄로(결제 번호로 짝, 운영자 11-22)", () => {
  const rows = mergeHistory(
    [pay("p1", 1000)],
    [tx("t1", 1001, "charge", "pg", "p1"), tx("t2", 1002, "charge", "first_charge_bonus", null, 14), tx("t3", 2000, "spend", "tarot_reading", null, 15)],
  );
  assert.deepEqual(rows.map((r) => r.id), ["s-t3", "s-t2", "p-p1"]);
  const p = rows.find((r) => r.kind === "payment");
  assert.ok(p && p.kind === "payment" && p.charge?.id === "t1");
  assert.equal(rows.filter((r) => r.kind === "star" && r.tx.id === "t1").length, 0);
});

test("mergeHistory — 짝 없는 결제(대기·환불)와 짝 없는 충전은 각자 그대로 남는다", () => {
  const rows = mergeHistory(
    [pay("p2", 500, "pending")],
    [tx("t9", 600, "charge", "pg", "p-unknown")],
  );
  assert.equal(rows.length, 2);
  const p = rows.find((r) => r.kind === "payment");
  assert.ok(p && p.kind === "payment" && p.charge === null);
});

test("mergeHistory — 최신순", () => {
  const rows = mergeHistory([pay("a", 100), pay("b", 300)], [tx("x", 200, "spend", "extend", null, 3)]);
  assert.deepEqual(rows.map((r) => r.time), [300, 200, 100]);
});

test("starTxSignedAmount — 사용·환불 회수는 빠진 별(음수), 나머지는 들어온 별(양수)", () => {
  assert.equal(starTxSignedAmount("spend", 5), -5);
  // 앱 결제 환불 회수(clawback_stars)는 'refund' 행에 거둔 양을 양수로 남긴다 — 내역엔 빠진 별로
  assert.equal(starTxSignedAmount("refund", 12), -12);
  assert.equal(starTxSignedAmount("charge", 10), 10);
  assert.equal(starTxSignedAmount("bonus", 2), 2);
  assert.equal(starTxSignedAmount("charge", -3), 3);
});

test("isHiddenStarTx — 거둔 게 0 인 환불 행(멱등 기준 행, 잔액 0 일 때 환불)은 내역에 안 보인다", () => {
  assert.equal(isHiddenStarTx("refund", 0), true);
  assert.equal(isHiddenStarTx("refund", 3), false);
  assert.equal(isHiddenStarTx("charge", 0), false);
  assert.equal(isHiddenStarTx("spend", 0), false);
});
