import { test } from "node:test";
import assert from "node:assert/strict";
import { isGoodScore, barHeightPx, barColor, cellTint, monthSummaryLabel } from "./calendar-visual.ts";

test("isGoodScore — dayGrade 의 good 임계(70)와 같은 자리에서 갈린다", () => {
  assert.equal(isGoodScore(69), false);
  assert.equal(isGoodScore(70), true);
  assert.equal(isGoodScore(100), true);
});

test("barHeightPx — 0~100 을 4~28px 로, 단조 증가", () => {
  assert.equal(barHeightPx(0), 4);
  assert.equal(barHeightPx(100), 28);
  assert.ok(barHeightPx(12) < barHeightPx(56));
  assert.ok(barHeightPx(56) < barHeightPx(92));
});

test("barHeightPx — 범위 밖 입력은 클램프", () => {
  assert.equal(barHeightPx(-40), 4);
  assert.equal(barHeightPx(9999), 28);
});

test("barColor — good 만 금색, 나머지는 단색 보라", () => {
  assert.equal(barColor(92), "#E8C26A");
  assert.equal(barColor(70), "#E8C26A");
  assert.equal(barColor(69), "#B8A8D8");
  assert.equal(barColor(12), "#B8A8D8");
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
//    (CalendarGrid.tsx 주석). 현행 normal 칸 #F4F2F7 ≈ #9F8AD0 12% 와 같은 값이다.
test("cellTint — 알파 바닥 0.12 아래로 안 내려간다", () => {
  for (let s = 0; s <= 100; s++) assert.ok(alphaOf(cellTint(s)) >= 0.12, `score ${s}`);
});

test("cellTint — good 임계 바로 위는 뚜렷하다(경계가 보인다)", () => {
  assert.ok(alphaOf(cellTint(70)) >= 0.45);
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
