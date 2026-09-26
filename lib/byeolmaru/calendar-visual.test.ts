import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isGoodScore,
  cellTint,
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

// 🔴 3차(2026-09-26) 보라 상한 확장(0.30→0.45)으로 스프레드 임계도 올린다 — 이유는 바로
//    아래 상한 테스트 주석 참고.
test("cellTint — 같은 한 주의 알파가 뚜렷하게 벌어진다", () => {
  const week = [25, 51, 56, 60, 61, 69].map((s) => alphaOf(cellTint(s)));
  assert.ok(Math.max(...week) - Math.min(...week) >= 0.28, week.join(","));
});

// 🔴 보라 상한을 0.30 → 0.45 로 올렸다(2026-09-26). 실측에서 보라 칸 전체가 0.14~0.29 안에
//    들어 3점과 64점이 구분되지 않았다 — 스펙은 "양방향 채도"라고 적었으나 실현은 단방향
//    (금색만 튐)이었고 "살짝 챙길 날"이 화면에서 사라졌다.
//    대비: #5A3E8C on 보라 0.45 = 5.38 (AA 4.5 통과). 09-24 에 상한을 낮춘 이유였던
//    "진한 면 위에서 숫자 대비가 깎인다"는 이 계산으로 해소된다 — 되돌리려면 다시 계산할 것.
test("cellTint — 보라 상한 0.45 · 금색 상한 0.65", () => {
  for (let s = 0; s <= 100; s++) {
    const css = cellTint(s);
    const a = alphaOf(css);
    const cap = css.startsWith("rgba(232") ? 0.65 : 0.45;
    assert.ok(a <= cap, `score ${s} alpha ${a} cap ${cap}`);
  }
});

test("cellTint — 제일 나쁜 날은 보라 상한에 닿는다(계조를 다 쓴다)", () => {
  assert.equal(alphaOf(cellTint(0)), 0.45);
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



