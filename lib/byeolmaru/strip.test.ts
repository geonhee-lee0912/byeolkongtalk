// lib/byeolmaru/strip.test.ts — 롤링 7일 창 계약. 월·연·윤년 경계에서 칸 수가 출렁이지 않는지가 핵심.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STRIP_LENGTH, STRIP_PAST_DAYS, stripDates, stripRange } from "./strip.ts";
import { FUTURE_REPORT_DAYS } from "./report-date.ts";

test("길이는 지난 3 + 오늘 + 미래 3 = 7", () => {
  assert.equal(STRIP_LENGTH, 7);
  // 🔴 상수 대조 단정 — 미래 칸 수를 스트립이 따로 정의하면 리포트 생성 범위와 어긋난다(스펙 §11 교차 계약).
  assert.equal(STRIP_LENGTH, STRIP_PAST_DAYS + 1 + FUTURE_REPORT_DAYS);
});

test("오늘이 정확히 4번째 칸(index 3)", () => {
  const d = stripDates("2026-09-20");
  assert.equal(d.length, 7);
  assert.equal(d[3], "2026-09-20");
  assert.deepEqual(d, [
    "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20",
    "2026-09-21", "2026-09-22", "2026-09-23",
  ]);
});

test("월 경계를 넘어도 7칸 — 달 1일", () => {
  assert.deepEqual(stripDates("2026-10-01"), [
    "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01",
    "2026-10-02", "2026-10-03", "2026-10-04",
  ]);
});

test("월 경계를 넘어도 7칸 — 달 말일", () => {
  const d = stripDates("2026-09-30");
  assert.equal(d.length, 7);
  assert.equal(d[6], "2026-10-03");
});

test("연 경계", () => {
  const d = stripDates("2027-01-01");
  assert.equal(d[0], "2026-12-29");
  assert.equal(d[6], "2027-01-04");
});

test("윤년 2월 29일", () => {
  const d = stripDates("2028-02-28");
  assert.equal(d[4], "2028-02-29");
  assert.equal(d[5], "2028-03-01");
});

test("stripRange 는 stripDates 의 양끝과 같다", () => {
  const d = stripDates("2026-09-20");
  assert.deepEqual(stripRange("2026-09-20"), { start: d[0], end: d[6] });
});
