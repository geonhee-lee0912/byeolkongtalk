import { test } from "node:test";
import assert from "node:assert/strict";
import { computeUnit, computeGuardrails, type UnitRow, type GuardRow } from "./layer1.ts";

test("computeUnit — 가입당 매출 ≈ 결제율 × ARPPU (표시 반올림 오차 안에서)", () => {
  const r: UnitRow = { signups: 914, payers: 82, revenueWon: 274_900, adSpendWon: 328_042 };
  const u = computeUnit(r);
  assert.ok(u.payRate !== null && u.arppuWon !== null && u.revPerSignup !== null);
  // payRate 는 소수 1자리로 반올림된 표시값이라(최대 ±0.05%p) 항등식이 그만큼 벌어진다.
  // 이 오차를 0 으로 만들려면 raw 비율을 따로 들고 다녀야 하는데, 화면이 쓰는 값과 판정이
  // 쓰는 값을 갈라놓는 게 더 위험하다(같은 지표가 두 숫자를 갖는다).
  const tolerance = (0.05 / 100) * u.arppuWon + 1e-9;
  assert.ok(Math.abs((u.payRate / 100) * u.arppuWon - u.revPerSignup) <= tolerance);
});

// 🔴 이 테스트가 이 모듈의 존재 이유다 — `num/den*100` 을 먼저 하면 23/80 이 28.7 로 찍힌다
//    (double 이 28.749999999999996). Task 1 리뷰가 BigInt 전수 대조로 찾은 결함이다.
test("computeGuardrails — 퍼센트는 소수 1자리 정확값 (23/80 = 28.8, 28.7 아니다)", () => {
  const out = computeGuardrails([{ metric: "first_reading_rate", num: 23, den: 80 }]);
  assert.equal(out.find((g) => g.key === "first_reading_rate")!.value, 28.8);
});

test("computeUnit — 결제율도 같은 규칙 (23/80)", () => {
  const u = computeUnit({ signups: 80, payers: 23, revenueWon: 0, adSpendWon: 0 });
  assert.equal(u.payRate, 28.8);
});

test("computeUnit — CAC 는 광고비 ÷ 가입", () => {
  const u = computeUnit({ signups: 914, payers: 82, revenueWon: 274_900, adSpendWon: 328_042 });
  assert.equal(Math.round(u.cacWon!), 359);
});

// 🔴 0 나눗셈이 Infinity/NaN 으로 새면 화면에 "Infinity원"이 뜬다. null 로 막는다.
test("computeUnit — 분모가 0 이면 null (0 이나 Infinity 가 아니다)", () => {
  const u = computeUnit({ signups: 0, payers: 0, revenueWon: 0, adSpendWon: 5000 });
  assert.equal(u.payRate, null);
  assert.equal(u.arppuWon, null);
  assert.equal(u.cacWon, null);
  assert.equal(u.revPerSignup, null);
});

test("computeGuardrails — 비율 지표는 num/den, 카운트 지표는 num 그대로", () => {
  const rows: GuardRow[] = [
    { metric: "first_reading_rate", num: 806, den: 914 },
    { metric: "new_error_classes", num: 2, den: 0 },
  ];
  const out = computeGuardrails(rows);
  const fr = out.find((g) => g.key === "first_reading_rate")!;
  assert.equal(Math.round(fr.value! * 10) / 10, 88.2);
  assert.equal(fr.n, 914);
  assert.equal(fr.alerting, false); // 88.2 >= 80

  const ne = out.find((g) => g.key === "new_error_classes")!;
  assert.equal(ne.value, 2);
  assert.equal(ne.alerting, true); // alertAbove 0
});

test("computeGuardrails — 가드레일 6종이 모두 나오고, 행이 없으면 value=null", () => {
  const out = computeGuardrails([]);
  assert.equal(out.length, 6);
  assert.ok(out.every((g) => g.value === null));
  assert.ok(out.every((g) => g.alerting === false)); // 값 없음은 경보가 아니다
});

test("computeGuardrails — 모르는 metric 문자열은 버린다 (크래시하지 않는다)", () => {
  const out = computeGuardrails([{ metric: "made_up_key", num: 1, den: 1 }]);
  assert.equal(out.length, 6);
});

// 소표본 게이트가 비율 지표에만 걸리는지 — 카운트는 n 과 무관하게 항상 보여야 한다.
test("computeGuardrails — 비율은 n<30 이면 가려지고 카운트는 안 가려진다", () => {
  const out = computeGuardrails([
    { metric: "login_success_rate", num: 7, den: 12 },
    { metric: "unreviewed_sensitive", num: 3, den: 0 },
  ]);
  assert.equal(out.find((g) => g.key === "login_success_rate")!.show, false);
  assert.equal(out.find((g) => g.key === "unreviewed_sensitive")!.show, true);
});
