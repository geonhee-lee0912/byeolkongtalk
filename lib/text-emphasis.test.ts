import { test } from "node:test";
import assert from "node:assert/strict";
import { splitEmphasis } from "./text-emphasis.ts";

test("**강조** 구간 분리", () => {
  assert.deepEqual(splitEmphasis("앞 **강조** 뒤"), [
    { text: "앞 ", bold: false },
    { text: "강조", bold: true },
    { text: " 뒤", bold: false },
  ]);
});

test("강조 없으면 통짜 세그먼트", () => {
  assert.deepEqual(splitEmphasis("그냥 문장"), [{ text: "그냥 문장", bold: false }]);
});

test("짝 안 맞는 ** 는 리터럴 유지", () => {
  assert.deepEqual(splitEmphasis("깨진 **별표"), [{ text: "깨진 **별표", bold: false }]);
});

test("여러 구간 + 빈 강조 무시", () => {
  assert.deepEqual(splitEmphasis("**a** 그리고 **b**"), [
    { text: "a", bold: true },
    { text: " 그리고 ", bold: false },
    { text: "b", bold: true },
  ]);
});
