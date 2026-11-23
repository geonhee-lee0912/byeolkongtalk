import { test } from "node:test";
import assert from "node:assert/strict";
import { stripHeadingEmoji, sectionPreview } from "./heading.ts";

// 리포트 소제목 앞 이모지는 지우고 번호 타일로(스펙 2026-11-09 §2.1) — 데이터 문자열은 그대로 둔다
test("stripHeadingEmoji: 앞 이모지와 뒤 공백을 지운다", () => {
  assert.equal(stripHeadingEmoji("🌱 타고난 기질·성격"), "타고난 기질·성격");
  assert.equal(stripHeadingEmoji("⏰ 주목할 시기"), "주목할 시기");
});
test("stripHeadingEmoji: ZWJ 이모지 시퀀스도 한 번에", () => {
  assert.equal(stripHeadingEmoji("👩‍❤️‍👨 궁합"), "궁합");
});
test("stripHeadingEmoji: 이모지 없으면 그대로", () => {
  assert.equal(stripHeadingEmoji("올해의 흐름"), "올해의 흐름");
});

test("sectionPreview: 볼드 걷어내고 첫 문장", () => {
  assert.equal(sectionPreview("**강한** 기운이 있어. 두 번째 문장은 안 나와."), "강한 기운이 있어.");
});

test("sectionPreview: 불릿·콜아웃 마커와 줄바꿈 제거", () => {
  assert.equal(sectionPreview("도입 한 줄이야.\n- 첫 불릿\n> 콜아웃"), "도입 한 줄이야.");
});

test("sectionPreview: 문장부호 없으면 통째로(라인클램프가 절단)", () => {
  assert.equal(sectionPreview("- 첫 불릿\n- 둘째 불릿"), "첫 불릿 둘째 불릿");
});

test("sectionPreview: 번호목록('1. ')은 첫 문장이 '1.'로 안 잘린다", () => {
  assert.equal(sectionPreview("1. 첫 기회의 설명이야. 부연.\n\n2. 둘째 기회."), "첫 기회의 설명이야.");
});
