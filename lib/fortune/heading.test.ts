import { test } from "node:test";
import assert from "node:assert/strict";
import { splitHeadingEmoji, sectionPreview } from "./heading.ts";

test("splitHeadingEmoji: 앞 이모지 분리", () => {
  assert.deepEqual(splitHeadingEmoji("🌱 타고난 성격"), { emoji: "🌱", title: "타고난 성격" });
});

test("splitHeadingEmoji: 이모지 없으면 기본 별", () => {
  assert.deepEqual(splitHeadingEmoji("타고난 성격"), { emoji: "✦", title: "타고난 성격" });
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
