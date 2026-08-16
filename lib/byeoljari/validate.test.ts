import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidBirthDate, isValidBirthTime } from "./validate.ts";

test("isValidBirthDate — 유효한 양력 날짜", () => {
  assert.equal(isValidBirthDate("1990-05-15"), true);
  assert.equal(isValidBirthDate("2000-02-29"), true); // 400년 윤년
  assert.equal(isValidBirthDate("2024-02-29"), true); // 4년 윤년
  assert.equal(isValidBirthDate("2026-12-31"), true);
});

test("isValidBirthDate — 캘린더상 무효", () => {
  assert.equal(isValidBirthDate("2026-13-45"), false); // 월>12
  assert.equal(isValidBirthDate("2026-00-10"), false); // 월 0
  assert.equal(isValidBirthDate("2026-02-30"), false); // 2월 30일
  assert.equal(isValidBirthDate("2026-04-31"), false); // 4월 31일 없음
  assert.equal(isValidBirthDate("2026-02-29"), false); // 비윤년 2/29
  assert.equal(isValidBirthDate("1900-02-29"), false); // 100년=비윤년
  assert.equal(isValidBirthDate("2026-01-00"), false); // 일 0
});

test("isValidBirthDate — 형식 오류", () => {
  assert.equal(isValidBirthDate("1990-5-15"), false); // 자리수
  assert.equal(isValidBirthDate("abc"), false);
  assert.equal(isValidBirthDate(""), false);
  assert.equal(isValidBirthDate("1990/05/15"), false);
});

test("isValidBirthTime — 유효", () => {
  assert.equal(isValidBirthTime("00:00"), true);
  assert.equal(isValidBirthTime("09:30"), true);
  assert.equal(isValidBirthTime("23:59"), true);
});

test("isValidBirthTime — 무효", () => {
  assert.equal(isValidBirthTime("24:00"), false);
  assert.equal(isValidBirthTime("12:60"), false);
  assert.equal(isValidBirthTime("9:30"), false); // 자리수
  assert.equal(isValidBirthTime("abc"), false);
  assert.equal(isValidBirthTime(""), false);
});
