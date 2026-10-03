import { test } from "node:test";
import assert from "node:assert/strict";
import { isFirstBirthEntry } from "./birth-lead.ts";

test("내 사주에 생일이 처음 들어가면 true", () => {
  assert.equal(isFirstBirthEntry({ isPrimary: true, prevBirth: null, nextBirth: "1995-03-02" }), true);
});

test("이미 생일이 있던 내 사주를 고치면 false (수정은 리드가 아니다)", () => {
  assert.equal(isFirstBirthEntry({ isPrimary: true, prevBirth: "1995-03-02", nextBirth: "1996-01-01" }), false);
});

test("지인 프로필은 생일이 처음이어도 false", () => {
  assert.equal(isFirstBirthEntry({ isPrimary: false, prevBirth: null, nextBirth: "1995-03-02" }), false);
});

test("생일 없이 저장하면 false ('생일 몰라요')", () => {
  assert.equal(isFirstBirthEntry({ isPrimary: true, prevBirth: null, nextBirth: null }), false);
});
