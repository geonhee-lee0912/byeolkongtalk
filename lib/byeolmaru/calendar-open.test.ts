// 전면 무료 계약 — 라우트(app/api/byeolmaru/calendar/route.ts)가 실제로 호출하는 함수를 그대로
// 불러 "자격과 무관하게 이번 달 전체가 나온다"를 코드 경로에 묶는다.
// 🔴 옛 free-line.test.ts(무료선 = 비자격자에게 미래를 안 싣는다)를 대체한다. 그 개념은
//    2026-09-26 에 폐지됐다 — 달력 칸은 룰 계산이라 변동비 0인데 잠겨 있었다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcSaju, calcDailyLuckRange } from "@/lib/saju/calc";
import { buildCalendarPayload, monthRange } from "./calendar.ts";
import { buildPairCalendar } from "./pair-day.ts";

const TODAY = "2026-09-13";
const saju = calcSaju({ year: 1994, month: 5, day: 17, hour: 14, gender: "other", isLunar: false });
const partnerSaju = calcSaju({ year: 1992, month: 11, day: 3, hour: 21, gender: "other", isLunar: false });

function build() {
  const { start, end } = monthRange(TODAY);
  return buildCalendarPayload(saju, calcDailyLuckRange(start, end), TODAY);
}

test("이번 달 달력은 1일부터 말일까지 전부 계산된다", () => {
  const { cells } = build();
  assert.equal(cells.length, 30, "2026-09 는 30일");
  assert.equal(cells[0].date, "2026-09-01");
  assert.equal(cells[29].date, "2026-09-30");
  assert.equal(cells.filter((c) => c.isToday).length, 1);
});

test("미래 날짜도 판정이 실린다(전면 무료 — 잠긴 칸 개념이 없다)", () => {
  const { cells } = build();
  const future = cells.filter((c) => c.date > TODAY);
  assert.equal(future.length, 17, "9/14~9/30");
  assert.ok(future.every((c) => typeof c.score === "number" && c.grade != null));
});

test("주차 요약도 이번 달 전체를 집계한다", () => {
  const { weeks } = build();
  assert.equal(weeks[0].startDate, "2026-09-01");
  assert.equal(weeks[weeks.length - 1].endDate, "2026-09-30");
});

// 🔴 월 범위 filter 는 **방어로 남긴다.** 앞뒤 달 채움(gridRange·fillCells)은 2026-09-27 에
//    폐지됐고 라우트는 이제 monthRange 로만 일진을 부르므로 이 테스트는 다시 no-op 가드다 —
//    그래도 지운다면, 라우트가 언젠가 다시 넓은 범위를 넘길 때 월 밖 날짜가 weekBuckets 로
//    새서 "이번 달 잘 맞는 날 N일"이 조용히 거짓이 된다. 값이 싸고 되돌리기 어려운 종류다.
test("월 밖 일진이 들어와도 cells·주차 집계에 안 샌다", () => {
  const luck = calcDailyLuckRange("2026-08-30", "2026-10-03");
  const payload = buildCalendarPayload(saju, luck, TODAY);
  const { cells, weeks } = payload;
  assert.equal(cells.length, 30, "cells 는 9월만");
  assert.equal(cells[0].date, "2026-09-01");
  assert.equal(cells[29].date, "2026-09-30");
  // 🔴 채움 폐지(2026-09-27) — 월 밖 날짜는 **어디로도 안 나간다**. 되살리려면 스펙을 먼저
  //    고칠 것: 사용자 판정은 "다 채우니 너무 복잡하다"였다(실물 검수 항목 5).
  assert.ok(!("fillCells" in payload), "fillCells 는 더 이상 내보내지 않는다");
  assert.equal(weeks[0].startDate, "2026-09-01");
  assert.equal(weeks[weeks.length - 1].endDate, "2026-09-30");
});

// 🔴 이건 이번 변경의 가드가 **아니다** — pair 엔진(buildPairCalendar)엔 원래 무료선이 없었고
//    라우트가 사후에 splitByFreeLine 을 걸었다. 즉 옛 코드에서도 이 테스트는 통과한다.
//    pair 의 실제 변경(라우트 조립)은 DB·세션을 물어 유닛에서 못 탄다 — 이 초록을
//    "pair 무료화가 테스트로 지켜진다"로 읽지 마라. 여기선 엔진 특성만 고정한다.
test("[우리] pair 달력도 이번 달 전부가 판정과 함께 나온다", () => {
  const { start, end } = monthRange(TODAY);
  const all = buildPairCalendar(saju, partnerSaju, calcDailyLuckRange(start, end), TODAY);
  assert.equal(all.length, 30);
  assert.ok(all.every((c) => c.tone != null));
});
