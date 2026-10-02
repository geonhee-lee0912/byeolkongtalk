import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calcSaju, type SajuInput } from "./calc.ts";
import {
  LUNAR_TABLE_START,
  LUNAR_TABLE_END,
  lunarLeapMonth,
  lunarMonthDays,
  lunarToSolar,
  maxBirthDay,
} from "./lunar-table.ts";

// ── 계약: 표 = 한국천문연구원(KASI) 음력 ──
// 정답지 = __fixtures__/kasi-lunar-1900-2049.txt (출처·조회일은 파일 머리). tyme4ts 음력은 중국 농력이라 정답지가 못 된다 —
// 1900~2049 에서 64개월이 다르다(specs/2026-10-02-음력-KASI-대조-findings.md).
interface KasiMonth {
  year: number;
  month: number;
  isLeap: boolean;
  solar: string; // 그달 1일의 양력 "YYYY-MM-DD"
  days: number;
}

const KASI: KasiMonth[] = readFileSync(new URL("./__fixtures__/kasi-lunar-1900-2049.txt", import.meta.url), "utf8")
  .split(/\r?\n/) // autocrlf 체크아웃이면 CRLF
  .filter((line) => line !== "" && !line.startsWith("#"))
  .map((line) => {
    const [ym, solar, days] = line.split(" ");
    return { year: Number(ym.slice(0, 4)), month: Number(ym.slice(5, 7)), isLeap: ym.endsWith("윤"), solar, days: Number(days) };
  });

/** 정답지의 한 해를 표와 같은 [윤달, 대소월] 형식으로. 정답지는 양력 순이라 한 해 안에서 윤달이 그 월 바로 뒤에 온다. */
function kasiYear(year: number): [number, string] {
  const months = KASI.filter((k) => k.year === year);
  return [months.find((k) => k.isLeap)?.month ?? 0, months.map((k) => (k.days === 30 ? "1" : "0")).join("")];
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

test("계약 — 1900~2049 음력 표가 KASI 와 같다 (어긋나면 새 표 리터럴을 찍는다)", () => {
  const first = KASI[0].year;
  const last = KASI[KASI.length - 1].year;
  const literal: string[] = [];
  const bad: number[] = [];
  for (let y = first; y <= last; y++) {
    const [leap, bits] = kasiYear(y);
    literal.push(`  [${leap}, "${bits}"], // ${y}`);
    const [tLeap, tBits] = readTable(y);
    if (tLeap !== leap || tBits !== bits) bad.push(y);
  }
  assert.deepEqual(
    bad,
    [],
    `표가 KASI 와 다른 해 ${bad.length}개: ${bad.slice(0, 10).join(", ")}${bad.length > 10 ? " …" : ""}\n` +
      `— lib/saju/lunar-table.ts 의 TABLE 내용을 아래 ${literal.length}줄로 통째 교체` +
      ` (붙여넣어도 그대로 실패하면 TABLE 이 아니라 lunarMonthDays 의 읽기 로직 문제):\n${literal.join("\n")}`
  );
  // 범위도 정답지와 같아야 한다 — 표 밖 해를 "있는 해"로 답하지 않게.
  assert.equal(LUNAR_TABLE_START, first);
  assert.equal(LUNAR_TABLE_END, last, "KASI 범위가 2050-11 에서 끝나 2050년은 한 해를 다 채울 수 없다");
});

const ymd = (s: { year: number; month: number; day: number } | null) =>
  s ? `${s.year}-${String(s.month).padStart(2, "0")}-${String(s.day).padStart(2, "0")}` : "null";
const addDays = (iso: string, n: number) => ymd((() => {
  const d = new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
})());

test("계약 — lunarToSolar: 1900~2049 모든 달의 1일·말일이 KASI 양력 날짜와 같다", () => {
  const bad: string[] = [];
  for (const k of KASI) {
    const tag = `${k.year}-${k.month}${k.isLeap ? "(윤)" : ""}`;
    const d1 = ymd(lunarToSolar(k.year, k.month, 1, k.isLeap));
    if (d1 !== k.solar) bad.push(`${tag} 1일: ${d1} ≠ ${k.solar}`);
    const dl = ymd(lunarToSolar(k.year, k.month, k.days, k.isLeap));
    if (dl !== addDays(k.solar, k.days - 1)) bad.push(`${tag} ${k.days}일: ${dl}`);
    if (lunarToSolar(k.year, k.month, k.days + 1, k.isLeap) !== null) bad.push(`${tag} ${k.days + 1}일이 있다`);
  }
  assert.deepEqual(bad, [], `${bad.length}곳: ${bad.slice(0, 10).join(" / ")}`);
});

test("계약 — calcSaju 의 음력 입력 = 같은 날의 KASI 양력 입력 (1900~2049 모든 달 1일)", () => {
  const bad: string[] = [];
  for (const k of KASI) {
    const lunarIn: SajuInput = { year: k.year, month: k.month, day: 1, hour: 12, isLunar: true, isLeapMonth: k.isLeap, gender: "other" };
    const [y, m, d] = k.solar.split("-").map(Number);
    let got: string;
    try {
      got = calcSaju(lunarIn).koreanString;
    } catch {
      got = "계산 불가";
    }
    if (got !== calcSaju({ year: y, month: m, day: d, hour: 12, gender: "other" }).koreanString) {
      bad.push(`${k.year}-${k.month}${k.isLeap ? "(윤)" : ""}`);
    }
  }
  assert.deepEqual(bad, [], `${bad.length}개월: ${bad.slice(0, 12).join(", ")}${bad.length > 12 ? " …" : ""}`);
});

test("lunarToSolar — 한국에만 있는 날은 변환되고, 없는 날은 null", () => {
  assert.equal(ymd(lunarToSolar(2017, 5, 1, true)), "2017-06-24", "2017 윤5월 1일");
  assert.equal(ymd(lunarToSolar(2017, 6, 15, false)), "2017-08-06", "2017 6월 15일 (중국 농력이면 07-08)");
  assert.equal(ymd(lunarToSolar(1997, 1, 5, false)), "1997-02-12", "1997 정월 5일 (중국 농력이면 02-11)");
  assert.equal(lunarToSolar(2017, 6, 1, true), null, "2017 윤6월은 중국 농력에만 있다");
  assert.equal(lunarToSolar(2012, 4, 1, true), null, "2012 윤4월은 중국 농력에만 있다");
  for (const day of [0, -1, 1.5, NaN]) assert.equal(lunarToSolar(2017, 6, day, false), null, `일 ${day}`);
  for (const month of [0, 13, 1.5, NaN]) assert.equal(lunarToSolar(2017, month, 1, false), null, `월 ${month}`);
  assert.equal(lunarToSolar(LUNAR_TABLE_START - 1, 12, 1, false), null);
  assert.equal(lunarToSolar(LUNAR_TABLE_END + 1, 1, 1, false), null);
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
  // 한국과 중국 농력(tyme4ts)이 갈리는 두 해 — 중기가 베이징 23시대 = KST 0시대에 걸렸다.
  assert.equal(lunarLeapMonth(2012), 3, "2012 윤3월 (중국 농력은 윤4월)");
  assert.equal(lunarLeapMonth(2017), 5, "2017 윤5월 (중국 농력은 윤6월)");
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
