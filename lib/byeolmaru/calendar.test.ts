import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCalendar, weekBuckets, toDaySelf, monthRange, splitByFreeLine } from "./calendar.ts";
import type { DailyLuck, SajuResult } from "@/lib/saju/calc";

// 최소 SajuResult — 조립에 쓰는 필드만 채운다(나머지는 이 모듈이 안 본다).
const SAJU = {
  pillars: {
    year: { stem: "병", branch: "인", hanja: "丙寅" },
    month: { stem: "정", branch: "묘", hanja: "丁卯" },
    day: { stem: "갑", branch: "자", hanja: "甲子" },
    hour: { stem: "무", branch: "진", hanja: "戊辰" },
  },
  dayStem: "갑",
  dayElement: "목",
  elementCount: { 목: 3, 화: 2, 토: 0, 금: 1, 수: 2 },
} as unknown as SajuResult;

const LUCK: DailyLuck[] = [
  { date: "2026-09-01", stem: "기", branch: "축", element: "토" }, // 천간합+육합+absent
  { date: "2026-09-02", stem: "경", branch: "오", element: "금" }, // 극아+충
  { date: "2026-09-03", stem: "임", branch: "신", element: "수" }, // 생아
];

test("toDaySelf — SajuResult 에서 판정 입력만 뽑는다", () => {
  const self = toDaySelf(SAJU);
  assert.equal(self.dayStem, "갑");
  assert.equal(self.dayBranch, "자", "일지는 pillars.day.branch 에서 온다");
  assert.equal(self.dayElement, "목");
  assert.equal(self.elementCount.토, 0);
});

test("buildCalendar — 셀마다 간지·점수·등급·축이 채워진다", () => {
  const cells = buildCalendar(SAJU, LUCK, "2026-09-02");
  assert.equal(cells.length, 3);

  assert.equal(cells[0].date, "2026-09-01");
  assert.equal(cells[0].ganji, "기축", "한글 간지 2자");
  assert.equal(cells[0].element, "토");
  assert.equal(cells[0].score, 92);
  assert.equal(cells[0].grade.tone, "good");
  assert.equal(cells[0].axes.love, 93);
  assert.equal(cells[0].isToday, false);

  assert.equal(cells[1].grade.tone, "caution");
  assert.equal(cells[1].isToday, true, "오늘 플래그는 인자로 받은 KST 날짜와 일치할 때만");

  // 임(수)신: elementRelation(목,수)=생아(+18) · 갑-임 천간합 아님 · 자-신 육합/충 아님
  //           · elementCount.수 = 2 → balanced(0)  →  50 + 18 = 68 → normal
  assert.equal(cells[2].score, 68);
  assert.equal(cells[2].grade.tone, "normal");
});

test("buildCalendar — 각 셀에 relation 노출(⑥ 골격 뱅크 키)", () => {
  const cells = buildCalendar(SAJU, LUCK, "2026-09-02");
  assert.equal(cells[0].relation, "아극", "목 극 토 = 내가 다루는 결");
  assert.equal(cells[1].relation, "극아", "금 극 목 = 나를 누르는 결");
  assert.equal(cells[2].relation, "생아", "수 생 목 = 날 살려주는 결");
});

test("buildCalendar — dailyLuck 이 비면 빈 배열", () => {
  assert.deepEqual(buildCalendar(SAJU, [], "2026-09-01"), []);
});

test("buildCalendar — 오늘이 목록에 없으면 isToday 가 하나도 없다", () => {
  const cells = buildCalendar(SAJU, LUCK, "2026-10-01");
  assert.equal(cells.filter((c) => c.isToday).length, 0);
});

test("weekBuckets — 7일씩 묶고 마지막 조각도 버리지 않는다", () => {
  const luck: DailyLuck[] = Array.from({ length: 30 }, (_, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, "0")}`,
    stem: "기",
    branch: "축",
    element: "토" as const,
  }));
  const cells = buildCalendar(SAJU, luck, "2026-09-01");
  const weeks = weekBuckets(cells);

  assert.equal(weeks.length, 5, "30일 = 7+7+7+7+2");
  assert.equal(weeks[0].index, 1);
  assert.equal(weeks[0].startDate, "2026-09-01");
  assert.equal(weeks[0].endDate, "2026-09-07");
  assert.equal(weeks[4].startDate, "2026-09-29");
  assert.equal(weeks[4].endDate, "2026-09-30", "마지막 2일 조각이 살아있어야 한다");
  assert.equal(weeks[0].good, 7, "전부 92점이라 7일 모두 good");
  assert.equal(weeks[0].caution, 0);
  assert.equal(weeks[0].avgScore, 92);
  assert.equal(weeks[4].good, 2);
  assert.equal(weeks[4].avgScore, 92, "마지막 2일 조각도 chunk.length 로 나눠야 한다 — 7 로 하드코딩하면 26 이 된다");
});

test("weekBuckets — 빈 입력은 빈 배열", () => {
  assert.deepEqual(weekBuckets([]), []);
});

// ── monthRange ──
test("monthRange — 그 달 1일~말일", () => {
  assert.deepEqual(monthRange("2026-09-13"), { start: "2026-09-01", end: "2026-09-30" });
  assert.deepEqual(monthRange("2026-01-01"), { start: "2026-01-01", end: "2026-01-31" });
  assert.deepEqual(monthRange("2026-12-31"), { start: "2026-12-01", end: "2026-12-31" });
});

test("monthRange — 2월 평년 28일 · 윤년 29일", () => {
  assert.equal(monthRange("2026-02-10").end, "2026-02-28", "2026 은 평년");
  assert.equal(monthRange("2028-02-10").end, "2028-02-29", "2028 은 윤년");
});

// ── splitByFreeLine ──
test("splitByFreeLine — 비자격은 오늘까지만 열리고 나머지는 날짜·간지만 남는다", () => {
  const cells = [
    { date: "2026-09-11", ganji: "갑자" },
    { date: "2026-09-12", ganji: "을축" },
    { date: "2026-09-13", ganji: "병인" },
  ];
  const r = splitByFreeLine(cells, "2026-09-12", false);
  assert.deepEqual(r.open.map((c) => c.date), ["2026-09-11", "2026-09-12"], "지나간 날 + 오늘");
  assert.deepEqual(r.lockedCells, [{ date: "2026-09-13", ganji: "병인" }], "안 온 날은 날짜·간지만");
});

test("splitByFreeLine — 자격자는 전부 열리고 잠긴 날이 없다", () => {
  const cells = [{ date: "2026-09-11", ganji: "갑자" }, { date: "2026-09-13", ganji: "병인" }];
  const r = splitByFreeLine(cells, "2026-09-12", true);
  assert.equal(r.open.length, 2);
  assert.deepEqual(r.lockedCells, []);
});

test("splitByFreeLine — 오늘은 언제나 열린 쪽(경계 off-by-one 고정)", () => {
  const r = splitByFreeLine([{ date: "2026-09-12", ganji: "갑자" }], "2026-09-12", false);
  assert.deepEqual(r.open.map((c) => c.date), ["2026-09-12"]);
  assert.deepEqual(r.lockedCells, []);
});
