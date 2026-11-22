// 계약: 사주 상담 결과의 다시 볼 날 줄 자리(운영자 11-22)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

test("사주 상담 결과의 다시 볼 날 줄은 타로처럼 한마디 카드 맨 아래, 한마디가 없으면 혼자", () => {
  const s = src("app/(consultations)/saju/result/page.tsx");
  assert.match(s, /\{closingLine\}\n\s*<\/p>\n\s*\{revisit\(true\)\}/);
  assert.match(s, /\{!closingLine && revisit\(false\)\}/);
  assert.equal(count(s, /<RevisitSheet\b/g), 1);
});
