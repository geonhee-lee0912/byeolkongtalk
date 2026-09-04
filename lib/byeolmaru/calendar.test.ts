import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCalendar, weekBuckets, toDaySelf } from "./calendar.ts";
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
});

test("weekBuckets — 빈 입력은 빈 배열", () => {
  assert.deepEqual(weekBuckets([]), []);
});
