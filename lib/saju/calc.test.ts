import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcSaju,
  calcDaeun,
  calcTemporalLuck,
  baseDateForKst,
  calcDailyLuckRange,
  canCalcSaju,
  type SajuInput,
  type SajuResult,
} from "./calc.ts";
import { kstDate } from "@/lib/admin-time";

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

// 음력은 한국천문연구원(KASI) 날짜로 계산한다 — tyme4ts 음력은 중국 농력이라 64개월이 다르다(lib/saju/lunar-table.ts).
test("음력 — 한국천문연구원 날짜로 계산한다 (중국 농력과 갈리는 달)", () => {
  // [음력 입력, 같은 날의 한국 양력]
  const cases: [Partial<SajuInput>, Partial<SajuInput>][] = [
    [{ year: 2017, month: 6, day: 15 }, { year: 2017, month: 8, day: 6 }], // 중국 농력은 윤달이 6월 뒤라 6월이 한 달 이르다(07-08)
    [{ year: 1997, month: 1, day: 5 }, { year: 1997, month: 2, day: 12 }], // 합삭 KST 00:06 — 중국 농력은 하루 이르다(02-11)
    [{ year: 1966, month: 1, day: 15 }, { year: 1966, month: 2, day: 5 }], // 하루 차이가 입춘을 넘어 연주까지 갈린다
    [{ year: 2017, month: 5, day: 15, isLeapMonth: true }, { year: 2017, month: 7, day: 8 }], // 한국에만 있는 윤5월
  ];
  for (const [lunarIn, solarIn] of cases) {
    const tag = `음력 ${lunarIn.year}-${lunarIn.month}${lunarIn.isLeapMonth ? "(윤)" : ""}-${lunarIn.day}`;
    assert.equal(calcSaju(solar({ ...lunarIn, isLunar: true })).koreanString, calcSaju(solar(solarIn)).koreanString, tag);
  }
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

test("대운 — 음력 입력도 한국천문연구원 날짜로 (음력 2017-06-15 = 양력 2017-08-06)", () => {
  for (const gender of ["male", "female"] as const) {
    const fromLunar = calcDaeun(solar({ year: 2017, month: 6, day: 15, isLunar: true, gender }), 3);
    const fromSolar = calcDaeun(solar({ year: 2017, month: 8, day: 6, gender }), 3);
    assert.deepEqual(fromLunar, fromSolar, gender);
  }
});

// ── baseDateForKst ──
test("baseDateForKst — KST 날짜 문자열이 서버 TZ 와 무관하게 그 날짜로 복원된다", () => {
  const base = baseDateForKst("2026-09-01");
  assert.equal(base.getFullYear(), 2026);
  assert.equal(base.getMonth(), 8, "0-based 월");
  assert.equal(base.getDate(), 1);
  assert.equal(base.getHours(), 12, "정오 — 경계 반올림 회피");
  // 월말·연말 경계도 밀리지 않는다
  const eoy = baseDateForKst("2026-12-31");
  assert.equal(eoy.getFullYear(), 2026);
  assert.equal(eoy.getMonth(), 11);
  assert.equal(eoy.getDate(), 31);
});

test("KST 체인 실물 — kstDate → baseDateForKst → calcTemporalLuck 이 오늘을 dailyLuck[0]으로 낸다", () => {
  // fortune/create, readings, byeolmaru/calendar 등 실제 호출부가 쓰는 체인을 그대로 재현한다.
  // kstDate(admin-time.ts, UTC+9 계산)와 이 파일의 fmtDate(로컬 getFullYear/getMonth/getDate)는
  // baseDateForKst 가 "KST 날짜 문자열 → 그 날짜의 로컬 정오 Date" 로 복원해주기 때문에만
  // 일치한다 — 둘 중 하나가 바뀌면(예: fmtDate 를 toISOString().slice(0,10) 로 "정리") 오늘
  // 판정이 조용히 어긋난다. 여러 TZ 에서 돌려야 이 일치가 서버 TZ 에 우연히 의존한 게 아니라는
  // 걸 확인할 수 있다.
  const todayKst = kstDate(new Date().toISOString());
  const temporal = calcTemporalLuck(baseDateForKst(todayKst), 1990, { includeMonth: true });
  assert.equal(temporal.dailyLuck?.length, 30, "includeMonth:true 는 항상 30일");
  assert.equal(
    temporal.dailyLuck?.[0].date,
    todayKst,
    "체인의 첫 날짜가 오늘의 KST 날짜와 일치해야 한다"
  );
});

// ── calcDailyLuckRange ──
test("calcDailyLuckRange — 양끝 포함, 월 경계를 넘어간다", () => {
  const r = calcDailyLuckRange("2026-09-28", "2026-10-02");
  assert.equal(r.length, 5, "9/28~10/2 = 5일(양끝 포함)");
  assert.equal(r[0].date, "2026-09-28");
  assert.equal(r[4].date, "2026-10-02");
});

test("calcDailyLuckRange — 하루짜리 범위", () => {
  const r = calcDailyLuckRange("2026-09-13", "2026-09-13");
  assert.equal(r.length, 1);
  assert.equal(r[0].date, "2026-09-13");
});

test("calcDailyLuckRange — end < start 면 빈 배열(호출부 실수를 조용히 늘리지 않는다)", () => {
  assert.deepEqual(calcDailyLuckRange("2026-09-13", "2026-09-12"), []);
});

test("calcDailyLuckRange — 같은 날짜는 calcTemporalLuck 의 30일 일진과 간지가 일치한다", () => {
  // 두 경로가 같은 tyme4ts 계산을 쓴다는 계약. 어긋나면 달력과 서술이 다른 간지를 말한다.
  const t = calcTemporalLuck(baseDateForKst("2026-09-13"), 1994, { includeMonth: true });
  const r = calcDailyLuckRange("2026-09-13", "2026-10-12");
  assert.equal(r.length, 30);
  for (let i = 0; i < 30; i++) {
    assert.equal(r[i].date, t.dailyLuck?.[i].date, `${i}번째 날짜 불일치`);
    assert.equal(
      r[i].stem + r[i].branch,
      (t.dailyLuck?.[i].stem ?? "") + (t.dailyLuck?.[i].branch ?? ""),
      `${r[i].date} 간지 불일치`
    );
  }
});

// ── canCalcSaju: 없는 날짜는 false (tyme4ts 가 throw) ──
test("canCalcSaju — 그달에 없는 음력 30·31일, 그해에 없는 윤달은 false", () => {
  const lunar = (o: Partial<SajuInput>) => solar({ year: 1996, month: 1, hour: null, isLunar: true, ...o });
  assert.equal(canCalcSaju(lunar({ day: 29 })), true, "1996 정월 = 29일");
  assert.equal(canCalcSaju(lunar({ day: 30 })), false);
  assert.equal(canCalcSaju(lunar({ day: 31 })), false);
  assert.equal(canCalcSaju(lunar({ month: 3, day: 1, isLeapMonth: true })), false, "1996 은 윤달 없음");
  assert.equal(canCalcSaju(lunar({ year: 1990, month: 5, day: 1, isLeapMonth: true })), true, "1990 윤5월");
  assert.equal(canCalcSaju(lunar({ year: 2020, month: 4, day: 30 })), true, "2020 4월 = 30일");
  assert.equal(canCalcSaju(lunar({ year: 2020, month: 4, day: 30, isLeapMonth: true })), false, "2020 윤4월 = 29일");
  assert.equal(canCalcSaju(lunar({ month: 3, day: 1 })), true, "1996-03-01 평달은 통과 — 원인은 윤달 플래그뿐");
  assert.equal(canCalcSaju(lunar({ year: 1990, month: 6, day: 1, isLeapMonth: true })), false, "1990 윤달은 5월뿐");
});

test("canCalcSaju — 한국에만 있는 날은 true, 중국 농력에만 있는 날·표 범위 밖 음력은 false", () => {
  const lunar = (o: Partial<SajuInput>) => solar({ hour: null, isLunar: true, ...o });
  assert.equal(canCalcSaju(lunar({ year: 2017, month: 5, day: 1, isLeapMonth: true })), true, "2017 윤5월");
  assert.equal(canCalcSaju(lunar({ year: 2017, month: 6, day: 1, isLeapMonth: true })), false, "2017 윤6월은 중국 농력에만");
  assert.equal(canCalcSaju(lunar({ year: 2012, month: 3, day: 1, isLeapMonth: true })), true, "2012 윤3월");
  assert.equal(canCalcSaju(lunar({ year: 2017, month: 6, day: 30 })), true, "2017 6월 = 30일 (중국 농력은 29일)");
  assert.equal(canCalcSaju(lunar({ year: 1997, month: 1, day: 30 })), false, "1997 정월 = 29일 (중국 농력은 30일)");
  assert.equal(canCalcSaju(lunar({ year: 1899, month: 12, day: 1 })), false, "표 범위(1900~2049) 밖 음력");
  assert.equal(canCalcSaju(lunar({ year: 2050, month: 1, day: 1 })), false, "표 범위(1900~2049) 밖 음력");
  assert.equal(canCalcSaju(solar({ year: 2050, month: 1, day: 1 })), true, "양력은 표와 무관");
});

test("canCalcSaju — 없는 양력 날짜는 false", () => {
  assert.equal(canCalcSaju(solar({ year: 2023, month: 2, day: 29 })), false);
  assert.equal(canCalcSaju(solar({ year: 2024, month: 2, day: 29 })), true);
});
