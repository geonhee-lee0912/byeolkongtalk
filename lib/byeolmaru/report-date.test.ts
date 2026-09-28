import { test } from "node:test";
import assert from "node:assert/strict";
import { isIsoDate, reportDatePolicy, dayWordFor, FUTURE_REPORT_DAYS } from "./report-date.ts";

const T = "2026-09-19";

test("isIsoDate: YYYY-MM-DD 만 허용", () => {
  assert.equal(isIsoDate("2026-09-19"), true);
  assert.equal(isIsoDate("2026-9-19"), false);
  assert.equal(isIsoDate("20260919"), false);
  assert.equal(isIsoDate(""), false);
  assert.equal(isIsoDate("2026-13-01"), false); // 달력상 없는 날짜
  assert.equal(isIsoDate("2026-02-30"), false);
  // 🔴 unknown 을 받는 이유 — 쿼리스트링에서 온 신뢰 불가 입력이 그대로 들어온다. throw 하지 않고 false 여야 한다.
  assert.equal(isIsoDate(null), false);
  assert.equal(isIsoDate(undefined), false);
  assert.equal(isIsoDate(20260919), false);
});

test("reportDatePolicy: 과거는 캐시만, 오늘만 생성, 내일부터는 거부", () => {
  assert.equal(reportDatePolicy("2026-09-18", T), "cache_only");
  assert.equal(reportDatePolicy("2026-08-01", T), "cache_only");
  assert.equal(reportDatePolicy(T, T), "generate");
  assert.equal(reportDatePolicy("2026-09-20", T), "out_of_range"); // 내일
  assert.equal(reportDatePolicy("2026-09-22", T), "out_of_range");
  assert.equal(reportDatePolicy("nope", T), "out_of_range");
});

test("reportDatePolicy: 월 경계를 건너도 일수로 센다", () => {
  assert.equal(reportDatePolicy("2026-09-30", "2026-09-30"), "generate");
  assert.equal(reportDatePolicy("2026-10-01", "2026-09-30"), "out_of_range"); // +1
  assert.equal(reportDatePolicy("2026-09-29", "2026-09-30"), "cache_only"); // -1
});

test("dayWordFor: 오늘만 '오늘', 나머지는 '그날'", () => {
  assert.equal(dayWordFor(T, T), "오늘");
  assert.equal(dayWordFor("2026-09-18", T), "그날");
  assert.equal(dayWordFor("2026-09-20", T), "그날");
});

// 🔴 3 으로 되돌리려면 그 3일을 **설명하는 표면**을 같이 만들어야 한다 — 예전엔 스트립의
//    점선 칸 3개가 그 역할이었고, 그 스트립이 2026-09-26 에 삭제됐다. 규칙만 남고 설명이
//    사라지는 게 제일 나쁜 조합이다(스펙 2026-09-26 §1-④).
test("FUTURE_REPORT_DAYS 는 0 — 리포트는 오늘 것만 생성한다", () => {
  assert.equal(FUTURE_REPORT_DAYS, 0);
});
