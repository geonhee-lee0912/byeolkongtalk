import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isGoodScore,
  cellTint,
  monthSummaryLabel,
  scorePercentile,
  scoreDisplay,
} from "./calendar-visual.ts";

test("isGoodScore — dayGrade 의 good 임계(70)와 같은 자리에서 갈린다", () => {
  assert.equal(isGoodScore(69), false);
  assert.equal(isGoodScore(70), true);
  assert.equal(isGoodScore(100), true);
});

test("cellTint — 70 미만은 보라, 70 이상은 금색", () => {
  assert.match(cellTint(30), /^rgba\(159, 138, 208, /);
  assert.match(cellTint(80), /^rgba\(232, 194, 106, /);
});

const alphaOf = (css: string): number => Number(css.slice(css.lastIndexOf(",") + 1, -1));

test("cellTint — 보라 구간은 점수가 낮을수록 진하다", () => {
  assert.ok(alphaOf(cellTint(12)) > alphaOf(cellTint(45)));
  assert.ok(alphaOf(cellTint(45)) > alphaOf(cellTint(69)));
});

test("cellTint — 금색 구간은 점수가 높을수록 진하다", () => {
  assert.ok(alphaOf(cellTint(92)) > alphaOf(cellTint(70)));
});

// 🔴 판(#ffffff) 위에서 칸이 사라지지 않는 하한. 순백+순백 조합으로 두 번 되돌린 이력이 있다
//    (CalendarGrid.tsx 주석).
test("cellTint — 알파 바닥 0.11 아래로 안 내려간다", () => {
  for (let s = 0; s <= 100; s++) assert.ok(alphaOf(cellTint(s)) >= 0.11, `score ${s}`);
});

test("cellTint — good 임계 바로 위는 뚜렷하다(경계가 보인다)", () => {
  assert.ok(alphaOf(cellTint(70)) >= 0.45);
});

// 🔴 2차 설계(2026-09-24)로 알파 범위가 0.55~0.12 → 0.30~0.11 로 좁아져 예전 임계(>=0.3)는
//    더 이상 도달 불가능하다 — 실측 스프레드는 0.18(아래 표본). 숫자가 주 신호가 됐으니 면의
//    변별력이 줄어드는 건 의도다: 완전히 사라지지만 않으면 된다.
test("cellTint — 같은 한 주의 알파도 벌어진다(폭이 좁아졌지만 완전히 뭉개지진 않는다)", () => {
  const week = [25, 51, 56, 60, 61, 69].map((s) => alphaOf(cellTint(s)));
  assert.ok(Math.max(...week) - Math.min(...week) >= 0.15, week.join(","));
});

test("cellTint — 알파 상한이 낮아졌다(숫자 대비 보호)", () => {
  for (let s = 0; s <= 100; s++) {
    const a = alphaOf(cellTint(s));
    assert.ok(a <= 0.65, `score ${s} alpha ${a}`);
  }
});

test("scorePercentile — 모집단 앵커를 그대로 되짚는다", () => {
  assert.equal(scorePercentile(12), 0);
  assert.equal(Math.round(scorePercentile(56) * 100), 50);
  assert.equal(Math.round(scorePercentile(73) * 100), 90);
  assert.equal(scorePercentile(92), 1);
});

test("scorePercentile — 단조 비감소", () => {
  for (let s = 1; s <= 100; s++) assert.ok(scorePercentile(s) >= scorePercentile(s - 1), `${s}`);
});

test("scoreDisplay — 원점수가 아니라 백분위를 찍는다", () => {
  // 🔴 모집단 중앙(56)이 50 으로 나와야 한다. 56 이 그대로 나오면 원점수를 쓰고 있는 것이다.
  assert.equal(scoreDisplay(56), 50);
  assert.equal(scoreDisplay(12), 0);
  assert.equal(scoreDisplay(92), 100);
  assert.equal(scoreDisplay(73), 90);
});

test("scoreDisplay — 단조 비감소이고 0~100 을 벗어나지 않는다", () => {
  for (let s = 1; s <= 100; s++) {
    assert.ok(scoreDisplay(s) >= scoreDisplay(s - 1), `${s}`);
    assert.ok(scoreDisplay(s) >= 0 && scoreDisplay(s) <= 100, `${s}`);
  }
});

test("monthSummaryLabel — 좋은 날이 있으면 날짜를 최대 3개까지 센다", () => {
  assert.equal(monthSummaryLabel(["2026-09-11", "2026-09-23"]), "이번 달 · 잘 맞는 날 11일 · 23일");
});

test("monthSummaryLabel — 3개를 넘으면 외 N일", () => {
  assert.equal(
    monthSummaryLabel(["2026-09-02", "2026-09-11", "2026-09-19", "2026-09-23", "2026-09-30"]),
    "이번 달 · 잘 맞는 날 2일 · 11일 · 19일 외 2일"
  );
});

test("monthSummaryLabel — 좋은 날이 없으면 폴백", () => {
  assert.equal(monthSummaryLabel([]), "이번 달 전체 보기");
});
