import { test } from "node:test";
import assert from "node:assert/strict";
import { stripNoteHeading } from "./daily-report.ts";

test("stripNoteHeading: '별콩이의 한마디:' 접두를 떼어낸다", () => {
  assert.equal(stripNoteHeading("별콩이의 한마디: 오늘은 가볍게."), "오늘은 가볍게.");
  assert.equal(stripNoteHeading("별콩이의 한마디 — 오늘은 가볍게."), "오늘은 가볍게.");
  assert.equal(stripNoteHeading("**별콩이의 한마디**: 오늘은 가볍게."), "오늘은 가볍게.");
  assert.equal(stripNoteHeading("  별콩이의 한마디:오늘은 가볍게."), "오늘은 가볍게.");
});

test("stripNoteHeading: 접두가 없으면 그대로 둔다", () => {
  assert.equal(stripNoteHeading("오늘은 가볍게."), "오늘은 가볍게.");
  assert.equal(stripNoteHeading("별콩이가 오늘 하고 싶은 말은 이거야."), "별콩이가 오늘 하고 싶은 말은 이거야.");
  // 🔴 구분자 없이 "별콩이의 한마디"로 시작하는 멀쩡한 문장 — 예전 정규식은 조사만 남기고 잘라먹었다.
  assert.equal(stripNoteHeading("별콩이의 한마디를 준비했어."), "별콩이의 한마디를 준비했어.");
  assert.equal(stripNoteHeading("별콩이의 한마디는 이거야."), "별콩이의 한마디는 이거야.");
  assert.equal(stripNoteHeading("오늘의 운세야. 별콩이의 한마디: 이건 중간에 있어."), "오늘의 운세야. 별콩이의 한마디: 이건 중간에 있어.");
  assert.equal(stripNoteHeading("   "), "");
});
