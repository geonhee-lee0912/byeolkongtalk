import { test } from "node:test";
import assert from "node:assert/strict";
import { dayFactors, dayScore, dayGrade, axisScores, type DaySelf } from "./day-score.ts";

// 일간 갑(목) · 일지 자 · 토가 0개인 사주 (총합 8)
const SELF_A: DaySelf = {
  dayStem: "갑",
  dayBranch: "자",
  dayElement: "목",
  elementCount: { 목: 3, 화: 2, 토: 0, 금: 1, 수: 2 },
};

// 일간 갑(목) · 일지 자 · 금이 4개로 과다한 사주 (총합 8)
const SELF_B: DaySelf = {
  dayStem: "갑",
  dayBranch: "자",
  dayElement: "목",
  elementCount: { 목: 2, 화: 1, 토: 1, 금: 4, 수: 0 },
};

test("dayFactors — 천간합 + 육합 + 없는 오행 보충이 모두 잡힌다", () => {
  // 기(토)축: 갑-기 천간합 · 자-축 육합 · 목극토 = 아극 · 토 0개 = absent
  const f = dayFactors(SELF_A, { stem: "기", branch: "축", element: "토" });
  assert.equal(f.relation, "아극");
  assert.equal(f.heavenlyCombo, true);
  assert.equal(f.sixCombo, true);
  assert.equal(f.clash, false);
  assert.equal(f.scarcity, "absent");
});

test("dayFactors — 충과 과다 오행이 잡힌다", () => {
  // 경(금)오: 금극목 = 극아 · 자-오 충 · 금 4개 = excess · 갑-경은 천간합 아님
  const f = dayFactors(SELF_B, { stem: "경", branch: "오", element: "금" });
  assert.equal(f.relation, "극아");
  assert.equal(f.heavenlyCombo, false);
  assert.equal(f.sixCombo, false);
  assert.equal(f.clash, true);
  assert.equal(f.scarcity, "excess");
});

test("dayScore — 가중치 합이 명시된 값과 일치한다", () => {
  // 50 + 아극8 + 천간합14 + 육합10 + absent10 = 92
  const good = dayFactors(SELF_A, { stem: "기", branch: "축", element: "토" });
  assert.equal(dayScore(good), 92);

  // 50 + 극아(-14) + 충(-16) + excess(-8) = 12
  const bad = dayFactors(SELF_B, { stem: "경", branch: "오", element: "금" });
  assert.equal(dayScore(bad), 12);
});

test("dayScore — 0~100 을 벗어나지 않는다", () => {
  const all: DaySelf[] = [SELF_A, SELF_B];
  const stems = ["갑","을","병","정","무","기","경","신","임","계"];
  const branches = ["자","축","인","묘","진","사","오","미","신","유","술","해"];
  const elements = ["목","화","토","금","수"] as const;
  for (const self of all) {
    for (const stem of stems) {
      for (const branch of branches) {
        for (const element of elements) {
          const s = dayScore(dayFactors(self, { stem, branch, element }));
          assert.ok(s >= 0 && s <= 100, `${stem}${branch}/${element} → ${s}`);
          assert.equal(Number.isInteger(s), true, "점수는 정수");
        }
      }
    }
  }
});

test("dayGrade — 경계값이 정확하다", () => {
  assert.equal(dayGrade(70).tone, "good");
  assert.equal(dayGrade(69).tone, "normal");
  assert.equal(dayGrade(45).tone, "normal");
  assert.equal(dayGrade(44).tone, "caution");
  assert.equal(dayGrade(100).tone, "good");
  assert.equal(dayGrade(0).tone, "caution");
});

test("dayGrade — 라벨에 단정 표현이 없다(페르소나 화법)", () => {
  for (const s of [0, 44, 45, 69, 70, 100]) {
    const label = dayGrade(s).label;
    assert.ok(label.length > 0);
    for (const banned of ["반드시", "절대", "확실", "될 거야", "한다"]) {
      assert.ok(!label.includes(banned), `"${label}" 에 단정 표현 "${banned}"`);
    }
  }
});

test("axisScores — 축마다 다른 무게로 나온다", () => {
  // 천간합+육합이 있는 날은 연애 축이 가장 높다
  const f = dayFactors(SELF_A, { stem: "기", branch: "축", element: "토" });
  const a = axisScores(f);
  assert.equal(a.love, 93);   // 50 + 천간합25 + 육합18
  assert.equal(a.money, 78);  // 50 + 아극18 + absent10
  assert.equal(a.work, 68);   // 50 + 육합8 + absent10
  assert.ok(a.love > a.money && a.money > a.work);
});

test("axisScores — 0~100 을 벗어나지 않는다", () => {
  const f = dayFactors(SELF_B, { stem: "경", branch: "오", element: "금" });
  const a = axisScores(f);
  for (const [k, v] of Object.entries(a)) {
    assert.ok(v >= 0 && v <= 100, `${k} → ${v}`);
  }
});
