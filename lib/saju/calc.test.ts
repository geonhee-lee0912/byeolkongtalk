import { test } from "node:test";
import assert from "node:assert/strict";
import { calcSaju, calcDaeun, type SajuInput, type SajuResult } from "./calc.ts";

const solar = (o: Partial<SajuInput>): SajuInput => ({
  year: 1990,
  month: 1,
  day: 1,
  hour: 12,
  minute: 0,
  gender: "other",
  ...o,
});
const gz = (p: SajuResult["pillars"]["year"]) => p.stem + p.branch;
const ALL_BRANCHES = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];

// ── 년주: 입춘(2/4) 경계 기준 (그레고리력 1/1 아님) ──
test("년주 — 입춘 前 출생은 전년도 간지", () => {
  // 1990 입춘 前 → 1989년주 己巳(기사)
  assert.equal(gz(calcSaju(solar({ year: 1990, month: 1, day: 10 })).pillars.year), "기사");
  // 2000 입춘 前 → 1999년주 己卯(기묘)
  assert.equal(gz(calcSaju(solar({ year: 2000, month: 1, day: 20 })).pillars.year), "기묘");
});

test("년주 — 입춘 後 출생은 당년 간지 (대조군)", () => {
  assert.equal(gz(calcSaju(solar({ year: 1990, month: 2, day: 10 })).pillars.year), "경오");
});

// ── 월주: 절기 경계 기준 ──
test("월주 — 절기 기준 월지 (2월=인, 9월=유, 12월=자)", () => {
  assert.equal(calcSaju(solar({ month: 2, day: 15 })).pillars.month.branch, "인"); // 입춘~경칩 = 寅
  assert.equal(calcSaju(solar({ month: 9, day: 15 })).pillars.month.branch, "유"); // 백로~한로 = 酉
  assert.equal(calcSaju(solar({ month: 12, day: 15 })).pillars.month.branch, "자"); // 대설~소한 = 子
});

test("월주 — 1990년 12개월 월지가 12지지 전부 한 번씩 등장", () => {
  const branches = Array.from({ length: 12 }, (_, i) => calcSaju(solar({ month: i + 1, day: 15 })).pillars.month.branch);
  assert.deepEqual([...new Set(branches)].sort(), [...ALL_BRANCHES].sort());
});

// ── 일주: 60갑자 (독립 구현과 교차검증된 값) ──
test("일주 — 정확값 유지 (회귀 가드)", () => {
  assert.equal(gz(calcSaju(solar({ month: 5, day: 15 })).pillars.day), "경진");
});

// ── 야자시: 23시 이후 출생 = 다음날 일주 (문서 다수설, tyme4ts 네이티브) ──
test("야자시 — 23:30 출생 일주는 다음날 것", () => {
  assert.equal(gz(calcSaju(solar({ month: 5, day: 15, hour: 12 })).pillars.day), "경진");
  assert.equal(gz(calcSaju(solar({ month: 5, day: 15, hour: 23, minute: 30 })).pillars.day), "신사"); // 5/16 일주
});

// ── SajuResult 형태 불변 (소비처 계약) ──
test("형태 — elementCount 합 8, yinYangCount 합 8", () => {
  const r = calcSaju(solar({ month: 5, day: 15 }));
  assert.equal(Object.values(r.elementCount).reduce((a, b) => a + b, 0), 8);
  assert.equal(r.yinYangCount.yang + r.yinYangCount.yin, 8);
});

test("형태 — koreanString / hanjaString 포맷 유지", () => {
  const r = calcSaju(solar({ year: 1990, month: 1, day: 10, hour: 12 }));
  assert.equal(r.koreanString, "기사년주, 정축월주, 을해일주, 임오시주");
  assert.equal(r.hanjaString, "己巳年柱, 丁丑月柱, 乙亥日柱, 壬午時柱");
  assert.equal(r.pillars.year.hanja, "己巳");
});

// ── 음력 입력 ──
test("음력 — 음력 1990-01-01 == 양력 1990-01-27 (기둥 동일)", () => {
  const lunar = calcSaju(solar({ year: 1990, month: 1, day: 1, hour: 12, isLunar: true }));
  const solarEq = calcSaju(solar({ year: 1990, month: 1, day: 27, hour: 12 }));
  assert.equal(lunar.koreanString, solarEq.koreanString);
  assert.equal(lunar.input.inputCalendar, "lunar");
});

test("음력 — 윤달 처리 (윤5월 ≠ 평5월)", () => {
  const normal = calcSaju(solar({ year: 1990, month: 5, day: 1, hour: 12, isLunar: true, isLeapMonth: false }));
  const leap = calcSaju(solar({ year: 1990, month: 5, day: 1, hour: 12, isLunar: true, isLeapMonth: true }));
  assert.notEqual(gz(normal.pillars.day), gz(leap.pillars.day));
});

// ── 시간 모름 ──
test("시간모름 — hour:null 이면 hourKnown=false, 기둥은 존재", () => {
  const r = calcSaju(solar({ month: 5, day: 15, hour: null }));
  assert.equal(r.input.hourKnown, false);
  assert.equal(r.pillars.day.stem.length, 1);
});

// ── 대운 ──
test("대운 — count 개 반환, 나이 오름차순, 10년 간격", () => {
  const d = calcDaeun(solar({ year: 1994, month: 5, day: 12, hour: 9, gender: "female" }), 8);
  assert.equal(d.length, 8);
  for (let i = 1; i < d.length; i++) {
    assert.ok(d[i].startAge > d[i - 1].startAge, "startAge 오름차순");
    assert.equal(d[i].endAge - d[i].startAge, 9, "10년 구간(포함형 9)");
  }
  assert.equal(d[0].stem.length, 1);
  assert.equal(d[0].branch.length, 1);
  assert.equal(d[0].hanja.length, 2);
});

test("대운 — 성별에 따라 방향(간지)이 달라진다", () => {
  const base = { year: 1994, month: 5, day: 12, hour: 9 } as const;
  const male = calcDaeun(solar({ ...base, gender: "male" }), 3);
  const female = calcDaeun(solar({ ...base, gender: "female" }), 3);
  assert.notEqual(male[0].hanja, female[0].hanja);
});

test("대운 — 시간 모름·음력도 계산된다", () => {
  assert.equal(calcDaeun(solar({ month: 5, day: 15, hour: null, gender: "male" }), 3).length, 3);
  assert.equal(calcDaeun(solar({ year: 1994, month: 4, day: 3, hour: 9, gender: "male", isLunar: true }), 2).length, 2);
});
