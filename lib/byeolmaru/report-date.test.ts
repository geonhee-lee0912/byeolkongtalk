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
});

test("reportDatePolicy: 과거는 캐시만, 오늘·앞으로 3일은 생성, 그 너머는 거부", () => {
  assert.equal(reportDatePolicy("2026-09-18", T), "cache_only");
  assert.equal(reportDatePolicy("2026-08-01", T), "cache_only");
  assert.equal(reportDatePolicy(T, T), "generate");
  assert.equal(reportDatePolicy("2026-09-20", T), "generate");
  assert.equal(reportDatePolicy("2026-09-22", T), "generate"); // 오늘+3
  assert.equal(reportDatePolicy("2026-09-23", T), "out_of_range"); // 오늘+4
  assert.equal(reportDatePolicy("nope", T), "out_of_range");
});

test("reportDatePolicy: 월 경계를 건너도 일수로 센다", () => {
  assert.equal(reportDatePolicy("2026-10-02", "2026-09-30"), "generate"); // +2
  assert.equal(reportDatePolicy("2026-10-04", "2026-09-30"), "out_of_range"); // +4
});

test("dayWordFor: 오늘만 '오늘', 나머지는 '그날'", () => {
  assert.equal(dayWordFor(T, T), "오늘");
  assert.equal(dayWordFor("2026-09-18", T), "그날");
  assert.equal(dayWordFor("2026-09-20", T), "그날");
});

test("FUTURE_REPORT_DAYS 는 스트립 블러 칸 수와 같은 3", () => {
  assert.equal(FUTURE_REPORT_DAYS, 3);
});
