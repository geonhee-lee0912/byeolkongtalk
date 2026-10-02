import { test } from "node:test";
import assert from "node:assert/strict";
import { validateProfile, profileRowToSaju } from "./profile-input.ts";

// 음력 1996-01-29 본인 — 1996 정월은 29일이라 이 날이 마지막 날.
const BASE = {
  displayName: "나",
  relationType: "self",
  birthDate: "1996-01-29",
  birthTime: null,
  isLunarInput: true,
  isLeapMonth: false,
  gender: "female",
};
const errOf = (o: Record<string, unknown>, opts?: { optionalBirth?: boolean }) => {
  const r = validateProfile({ ...BASE, ...o }, opts);
  return "error" in r ? r.error : null;
};

test("validateProfile — 그달에 없는 음력 30·31일, 그해에 없는 윤달은 invalid_lunar_date", () => {
  assert.equal(errOf({ birthDate: "1996-01-30" }), "invalid_lunar_date");
  assert.equal(errOf({ birthDate: "1996-01-31" }), "invalid_lunar_date");
  assert.equal(errOf({ birthDate: "1996-03-01", isLeapMonth: true }), "invalid_lunar_date", "1996 은 윤달 없음");
});

test("validateProfile — 실존 음력 날짜·윤달은 통과", () => {
  assert.equal(errOf({}), null, "음력 1996-01-29");
  assert.equal(errOf({ birthDate: "1990-05-01", isLeapMonth: true }), null, "1990 윤5월");
  assert.equal(errOf({ birthDate: "1996-01-30", isLunarInput: false }), null, "양력 1/30 은 정상");
});

test("validateProfile — DATE 컬럼에 못 들어가는 Y-M-D 는 invalid_birth_date (양력·음력 공통)", () => {
  assert.equal(errOf({ birthDate: "2023-02-29", isLunarInput: false }), "invalid_birth_date");
  // 음력 1997-02-29 는 실존하지만(음력 달은 늘 29일 이상) 1997-02-29 는 그레고리력에 없다.
  assert.equal(errOf({ birthDate: "1997-02-29" }), "invalid_birth_date");
});

test("validateProfile — 범위 밖 시각은 날짜 오류가 아니라 invalid_birth_time", () => {
  assert.equal(errOf({ birthTime: "24:00" }), "invalid_birth_time");
  assert.equal(errOf({ birthTime: "09:30" }), null);
});

test("validateProfile — optionalBirth 모드도 생일이 있으면 같은 판정, 없으면 통과", () => {
  assert.equal(errOf({ birthDate: "1996-01-30" }, { optionalBirth: true }), "invalid_lunar_date");
  assert.equal(errOf({ birthDate: null }, { optionalBirth: true }), null);
});

test("validateProfile — 연도가 엔진 범위 밖이면 양·음력 모두 거부 (양력 라벨은 ③ 에서만 나온다)", () => {
  assert.equal(errOf({ birthDate: "0001-01-01", isLunarInput: false }), "invalid_birth_date");
  assert.equal(errOf({ birthDate: "0000-01-01" }), "invalid_lunar_date");
});

test("validateProfile — optionalBirth: 시각 범위 밖은 거부, 생일이 빈 문자열이면 판정 생략", () => {
  assert.equal(errOf({ birthTime: "24:00" }, { optionalBirth: true }), "invalid_birth_time");
  assert.equal(errOf({ birthDate: "", birthTime: "24:00" }, { optionalBirth: true }), null);
});

test("validateProfile — 양력 + isLeapMonth:true 는 통과 (양력이면 엔진·읽는 쪽 모두 윤달 플래그를 무시)", () => {
  assert.equal(errOf({ birthDate: "1996-01-30", isLunarInput: false, isLeapMonth: true }), null);
});

const ROW = {
  birth_date: "1996-01-29",
  birth_time: null,
  is_lunar_input: true,
  is_leap_month: false,
  gender: "female",
};

test("profileRowToSaju — 유효 행은 사주, DB 시각 형식(HH:MM:SS)도 그대로", () => {
  const r = profileRowToSaju(ROW);
  assert.equal(r.error, null);
  assert.equal(r.saju?.input.inputCalendar, "lunar");
  assert.equal(profileRowToSaju({ ...ROW, birth_time: "09:30:00" }).saju?.input.hourKnown, true);
});

test("profileRowToSaju — 계산 못 하는 행은 throw 대신 saju null + error", () => {
  const r = profileRowToSaju({ ...ROW, birth_date: "1996-01-30" });
  assert.equal(r.saju, null);
  assert.ok(r.error instanceof Error);
});

test("profileRowToSaju — 생일 없는 행은 saju·error 둘 다 null", () => {
  assert.deepEqual(profileRowToSaju({ ...ROW, birth_date: null }), { saju: null, error: null });
});

test("계약 — validateProfile 을 통과한 생일은 저장 후 profileRowToSaju 가 계산한다", () => {
  for (const o of [
    {},
    { birthDate: "1990-05-01", isLeapMonth: true, birthTime: "09:30" },
    { birthDate: "2024-02-29", isLunarInput: false, birthTime: "23:30" },
  ]) {
    const v = validateProfile({ ...BASE, ...o });
    assert.ok(!("error" in v), JSON.stringify(o));
    const r = profileRowToSaju({
      birth_date: v.birthDate,
      birth_time: v.birthTime === null ? null : `${v.birthTime}:00`, // DB TIME 은 HH:MM:SS 로 돌아온다
      is_lunar_input: v.isLunarInput,
      is_leap_month: v.isLeapMonth,
      gender: v.gender,
    });
    assert.notEqual(r.saju, null, JSON.stringify(o));
  }
});
