import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isGoodScore,
  cellTint,
  cellTextColor,
  scorePercentile,
  scoreDisplay,
} from "./calendar-visual.ts";

test("isGoodScore — dayGrade 의 good 임계(68)와 같은 자리에서 갈린다", () => {
  assert.equal(isGoodScore(67), false);
  assert.equal(isGoodScore(68), true);
  assert.equal(isGoodScore(100), true);
});

// 🔴🔴 **이 파일에서 제일 중요한 계약이다.** 칸에 찍히는 숫자(scoreDisplay = 백분위)와
//    칸 색·라벨(dayGrade = 원점수)은 원래 **다른 축**이었다. 그래서 화면에 70 이 찍힌 날이
//    금색이 아니고 25 가 찍힌 날이 보라인 칸이 30칸 중 11칸 나왔다(2026-09-27 실물 지적).
//    dayGrade 임계를 68/46 으로 옮겨 두 축을 화면 숫자 80/20 에서 만나게 했다 —
//    백분위가 단조 증가하고 앵커에 46·68 이 그대로 있어 **정확히** 맞아떨어진다.
//    🔴 dayGrade 임계나 SCORE_PERCENTILE_ANCHORS 중 하나만 건드리면 이 테스트가 깨진다.
//       깨졌다면 "테스트를 고칠" 게 아니라 **둘을 다시 같은 자리로 맞춰야** 한다.
test("축 정렬 — 화면 숫자 80/20 이 곧 색 경계다 (0~100 전수)", () => {
  for (let s = 0; s <= 100; s++) {
    const d = scoreDisplay(s);
    const gold = cellTint(s).startsWith("rgba(232");
    const terra = cellTint(s).startsWith("rgba(201");
    assert.equal(gold, d >= 80, `score ${s}: 화면 ${d}점인데 금색=${gold}`);
    assert.equal(terra, d < 20, `score ${s}: 화면 ${d}점인데 테라코타=${terra}`);
  }
});

// 🔴 3색이다(2026-09-27) — 방향을 **색상**이 말하고 농도는 정도만 말한다. 2색이던 시절엔
//    보라 상한(0.45)과 금색 하한(0.45)이 같은 알파라 "제일 나쁜 날"과 "약한 좋은 날"이 같은
//    세기로 튀었다(실물 검수 항목 19, 사용자 판정). 경계는 dayGrade 3단 그대로다 —
//    칸 색이 칸을 눌렀을 때 뜨는 라벨("살짝 챙길 날")과 같은 말을 하게 하려는 것.
test("cellTint — caution(<46)은 테라코타 · normal 은 보라 · good(>=68)은 금색", () => {
  assert.match(cellTint(30), /^rgba\(201, 112, 92, /, "caution");
  assert.match(cellTint(45), /^rgba\(201, 112, 92, /, "caution 경계 바로 아래");
  assert.match(cellTint(46), /^rgba\(159, 138, 208, /, "normal 경계");
  assert.match(cellTint(67), /^rgba\(159, 138, 208, /, "normal 위끝");
  assert.match(cellTint(80), /^rgba\(232, 194, 106, /, "good");
});

// 🔴 농도 공식은 안 바꿨다 — 색상만 갈랐다. calendar-visual.ts 머리말의 "등급 3단을 배경에
//    쓰지 않는다"(normal 이 64%라 7칸 중 4~5칸이 같은 색이 됐다)는 **3단만으로** 칠했을 때의
//    실패다. normal 안의 백분위 농도가 그대로 살아 있으므로 그 실패로 돌아가지 않는다.
test("cellTint — caution/normal 경계에서 알파가 안 튄다(농도는 연속이다)", () => {
  assert.ok(Math.abs(alphaOf(cellTint(45)) - alphaOf(cellTint(46))) <= 0.02);
});

test("cellTextColor — 3단이 각자 다른 글자색을 쓴다", () => {
  assert.equal(cellTextColor(30), "#6B2D22", "caution = 테라코타 계열 적갈");
  assert.equal(cellTextColor(60), "#5A3E8C", "normal = eye-purple");
  assert.equal(cellTextColor(80), "#412402", "good = 금색 칸의 짙은 갈색");
});

const alphaOf = (css: string): number => Number(css.slice(css.lastIndexOf(",") + 1, -1));

test("cellTint — good 미만 구간은 점수가 낮을수록 진하다(색이 갈려도 농도는 이어진다)", () => {
  assert.ok(alphaOf(cellTint(12)) > alphaOf(cellTint(45)));
  assert.ok(alphaOf(cellTint(45)) > alphaOf(cellTint(67)));
});

test("cellTint — 금색 구간은 점수가 높을수록 진하다", () => {
  assert.ok(alphaOf(cellTint(92)) > alphaOf(cellTint(68)));
});

// 🔴 판(#ffffff) 위에서 칸이 사라지지 않는 하한. 순백+순백 조합으로 두 번 되돌린 이력이 있다
//    (CalendarGrid.tsx 주석).
test("cellTint — 알파 바닥 0.11 아래로 안 내려간다", () => {
  for (let s = 0; s <= 100; s++) assert.ok(alphaOf(cellTint(s)) >= 0.11, `score ${s}`);
});

test("cellTint — good 임계 바로 위는 뚜렷하다(경계가 보인다)", () => {
  assert.ok(alphaOf(cellTint(68)) >= 0.45);
});

// 🔴 3차(2026-09-26) 보라 상한 확장(0.30→0.45)으로 스프레드 임계도 올린다 — 이유는 바로
//    아래 상한 테스트 주석 참고. 25 는 2026-09-27 부터 테라코타지만 알파 공식은 그대로라
//    이 스프레드 계약은 색 분리와 무관하게 유효하다. 🔴 샘플의 69 → 67 은 2026-09-27 임계
//    이동(70→68)으로 69 가 good 이 되어 "good 미만 스프레드"라는 의도를 벗어났기 때문이다.
test("cellTint — 같은 한 주의 알파가 뚜렷하게 벌어진다", () => {
  const week = [25, 51, 56, 60, 61, 67].map((s) => alphaOf(cellTint(s)));
  assert.ok(Math.max(...week) - Math.min(...week) >= 0.28, week.join(","));
});

// 🔴 보라 상한을 0.30 → 0.45 로 올렸다(2026-09-26). 실측에서 보라 칸 전체가 0.14~0.29 안에
//    들어 3점과 64점이 구분되지 않았다 — 스펙은 "양방향 채도"라고 적었으나 실현은 단방향
//    (금색만 튐)이었고 "살짝 챙길 날"이 화면에서 사라졌다.
//    대비: #5A3E8C on 보라 0.45 = 5.38 (AA 4.5 통과). 09-24 에 상한을 낮춘 이유였던
//    "진한 면 위에서 숫자 대비가 깎인다"는 이 계산으로 해소된다 — 되돌리려면 다시 계산할 것.
test("cellTint — 테라코타·보라 상한 0.45 · 금색 상한 0.65", () => {
  for (let s = 0; s <= 100; s++) {
    const css = cellTint(s);
    const a = alphaOf(css);
    const cap = css.startsWith("rgba(232") ? 0.65 : 0.45;
    assert.ok(a <= cap, `score ${s} alpha ${a} cap ${cap}`);
  }
});

test("cellTint — 제일 나쁜 날은 테라코타 상한에 닿는다(계조를 다 쓴다)", () => {
  assert.equal(alphaOf(cellTint(0)), 0.45);
  assert.match(cellTint(0), /^rgba\(201, 112, 92, /);
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



