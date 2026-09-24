import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isGoodScore,
  barHeightPx,
  barColor,
  cellTint,
  monthSummaryLabel,
  scorePercentile,
} from "./calendar-visual.ts";

test("isGoodScore — dayGrade 의 good 임계(70)와 같은 자리에서 갈린다", () => {
  assert.equal(isGoodScore(69), false);
  assert.equal(isGoodScore(70), true);
  assert.equal(isGoodScore(100), true);
});

test("barHeightPx — 모집단 최저(12) 이하는 4px, 최고(92) 이상은 28px, 그 사이는 단조 증가", () => {
  assert.equal(barHeightPx(0), 4);
  assert.equal(barHeightPx(12), 4);
  assert.equal(barHeightPx(92), 28);
  assert.equal(barHeightPx(100), 28);
  assert.ok(barHeightPx(38) < barHeightPx(56));
  assert.ok(barHeightPx(56) < barHeightPx(73));
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

// 🔴 이 테스트가 이 파일의 존재 이유다 — 선형 매핑으로 되돌리면 여기서 걸린다.
//    실계정 실측: 한 달 점수의 절반이 51~61 안에 있었고, 0~100 선형에서는 그 구간이
//    막대 2.4px 라 7칸이 거의 같아 보였다(실물 검수 실패).
test("barHeightPx — 실데이터가 몰린 구간(51~61)이 막대에서 충분히 벌어진다", () => {
  assert.ok(barHeightPx(61) - barHeightPx(51) >= 5, `${barHeightPx(51)} → ${barHeightPx(61)}`);
});

test("barHeightPx — 실측된 한 주(60·60·71·61·51·51·63)가 눈에 보이게 갈린다", () => {
  const week = [60, 60, 71, 61, 51, 51, 63].map(barHeightPx);
  assert.ok(Math.max(...week) - Math.min(...week) >= 10, week.join(","));
});

test("cellTint — 같은 한 주의 알파도 벌어진다", () => {
  const alphaOf = (css: string): number => Number(css.slice(css.lastIndexOf(",") + 1, -1));
  const month = [25, 51, 56, 60, 61, 69].map((s) => alphaOf(cellTint(s)));
  assert.ok(Math.max(...month) - Math.min(...month) >= 0.3, month.join(","));
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
