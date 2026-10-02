import { test } from "node:test";
import assert from "node:assert/strict";
import { canCalcSaju, type SajuInput } from "./calc.ts";
import {
  LUNAR_TABLE_START,
  LUNAR_TABLE_END,
  lunarLeapMonth,
  lunarMonthDays,
  maxBirthDay,
} from "./lunar-table.ts";

// ── 계약: 표 = 엔진 ──
// 탐침은 calcSaju(canCalcSaju)만 쓴다 — tyme4ts 직접 호출 금지(AGENTS.md). 결과는 표와 같은 [윤달, 대소월] 형식.
const lunar = (year: number, month: number, day: number, isLeapMonth: boolean): SajuInput => ({
  year,
  month,
  day,
  hour: null,
  isLunar: true,
  isLeapMonth,
  gender: "other",
});

function probeYear(year: number): [number, string] {
  const leaps: number[] = [];
  for (let m = 1; m <= 12; m++) if (canCalcSaju(lunar(year, m, 1, true))) leaps.push(m);
  assert.ok(leaps.length <= 1, `${year}: 윤달이 둘 이상 — ${leaps.join(",")}`);
  const leap = leaps[0] ?? 0;
  let bits = "";
  for (let m = 1; m <= 12; m++) {
    for (const isLeap of leap === m ? [false, true] : [false]) {
      const tag = `${year}-${m}${isLeap ? "(윤)" : ""}`;
      // 음력 달은 29일 아니면 30일 — 29일은 늘 있고 31일은 늘 없다.
      assert.ok(canCalcSaju(lunar(year, m, 29, isLeap)), `${tag}: 29일이 없다`);
      assert.ok(!canCalcSaju(lunar(year, m, 31, isLeap)), `${tag}: 31일이 있다`);
      bits += canCalcSaju(lunar(year, m, 30, isLeap)) ? "1" : "0";
    }
  }
  return [leap, bits];
}

/** 공개 API 로 표를 같은 형식으로 다시 읽는다. 0(없는 달)은 "?" 로 드러낸다. */
function readTable(year: number): [number, string] {
  const leap = lunarLeapMonth(year);
  let bits = "";
  for (let m = 1; m <= 12; m++) {
    for (const isLeap of leap === m ? [false, true] : [false]) {
      const d = lunarMonthDays(year, m, isLeap);
      bits += d === 30 ? "1" : d === 29 ? "0" : "?";
    }
  }
  return [leap, bits];
}

test("계약 — 1900~2100 음력 표가 calcSaju 와 같다 (어긋나면 새 표 리터럴을 찍는다)", () => {
  const literal: string[] = [];
  const bad: number[] = [];
  for (let y = LUNAR_TABLE_START; y <= LUNAR_TABLE_END; y++) {
    const [leap, bits] = probeYear(y);
    literal.push(`  [${leap}, "${bits}"], // ${y}`);
    const [tLeap, tBits] = readTable(y);
    if (tLeap !== leap || tBits !== bits) bad.push(y);
  }
  assert.deepEqual(
    bad,
    [],
    `표가 엔진과 다른 해 ${bad.length}개: ${bad.slice(0, 10).join(", ")}${bad.length > 10 ? " …" : ""}\n` +
      `— lib/saju/lunar-table.ts 의 TABLE 내용을 아래 ${literal.length}줄로 통째 교체` +
      ` (붙여넣어도 그대로 실패하면 TABLE 이 아니라 lunarMonthDays 의 읽기 로직 문제):\n${literal.join("\n")}`
  );
});

test("lunarMonthDays — 그해 윤달이 아닌 달에 윤달을 물으면 0, 월·연도가 범위 밖이어도 0", () => {
  assert.equal(lunarMonthDays(1996, 3, true), 0, "1996 은 윤달 없음");
  assert.equal(lunarMonthDays(2020, 5, true), 0, "2020 은 윤4월");
  assert.equal(lunarMonthDays(LUNAR_TABLE_START - 1, 1, false), 0);
  assert.equal(lunarMonthDays(LUNAR_TABLE_END + 1, 1, false), 0);
  assert.equal(lunarLeapMonth(LUNAR_TABLE_START - 1), 0);
  assert.equal(lunarLeapMonth(LUNAR_TABLE_END + 1), 0);
  for (const m of [0, 13, 1.5, NaN]) assert.equal(lunarMonthDays(1996, m, false), 0, `월 ${m}`);
  // 전 연도: 그해 윤달이 아닌 달에 윤달을 물으면 0
  for (let y = LUNAR_TABLE_START; y <= LUNAR_TABLE_END; y++) {
    for (let m = 1; m <= 12; m++) {
      if (m !== lunarLeapMonth(y)) assert.equal(lunarMonthDays(y, m, true), 0, `${y}-${m}(윤)`);
    }
  }
});

test("lunarLeapMonth — 알려진 해", () => {
  assert.equal(lunarLeapMonth(1996), 0);
  assert.equal(lunarLeapMonth(1990), 5);
  assert.equal(lunarLeapMonth(2020), 4);
  assert.equal(lunarLeapMonth(2025), 6);
  assert.equal(lunarLeapMonth(2033), 11, "2033 윤11월 — 잘 알려진 특이 케이스");
});

test("maxBirthDay — 양력은 그 월 일수, 윤달 플래그 무시", () => {
  assert.equal(maxBirthDay(2024, 2, false, false), 29);
  assert.equal(maxBirthDay(2023, 2, false, false), 28);
  assert.equal(maxBirthDay(2023, 4, false, false), 30);
  assert.equal(maxBirthDay(2023, 1, false, true), 31);
});

test("maxBirthDay — 음력은 그달 실제 일수 (1996 정월 29일 · 2020 4월 30일 · 윤4월 29일)", () => {
  assert.equal(maxBirthDay(1996, 1, true, false), 29);
  assert.equal(maxBirthDay(2020, 4, true, false), 30);
  assert.equal(maxBirthDay(2020, 4, true, true), 29);
  assert.equal(maxBirthDay(LUNAR_TABLE_END + 1, 1, true, false), 0, "표 범위 밖 음력은 0");
});

test("maxBirthDay — 윤달 플래그는 그해 윤달이 이 달일 때만 (아니면 평달 일수)", () => {
  assert.equal(maxBirthDay(2020, 5, true, true), maxBirthDay(2020, 5, true, false));
  assert.equal(maxBirthDay(1996, 3, true, true), maxBirthDay(1996, 3, true, false));
});

test("maxBirthDay — 음력 2월은 같은 해 양력 2월 일수를 못 넘는다 (birth_date 가 DATE 컬럼)", () => {
  assert.equal(lunarMonthDays(1901, 2, false), 30, "1901 음력 2월 = 30일");
  assert.equal(maxBirthDay(1901, 2, true, false), 28, "1901 양력 2월 = 28일");
  assert.equal(lunarMonthDays(1904, 2, false), 30, "1904 음력 2월 = 30일");
  assert.equal(maxBirthDay(1904, 2, true, false), 29, "1904 양력 2월 = 29일(윤년)");
});
