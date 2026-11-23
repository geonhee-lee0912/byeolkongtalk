// 계약: 공유로 나가는 한마디에는 강조 별표(**)가 없다(운영자 11-22 시안15 A). 화면의 강조는 그대로.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as emphasis from "./text-emphasis.ts";

const src = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

test("공유용 한마디는 별표만 뺀다", () => {
  const strip = emphasis.stripEmphasisMarks;
  assert.equal(strip("말보다 **시간을 잡으려는 행동**을 봐줘."), "말보다 시간을 잡으려는 행동을 봐줘.");
  assert.equal(strip("잘려서 짝이 없는 **강조"), "잘려서 짝이 없는 강조");
  assert.equal(strip("별표 없는 말 * 하나는 그대로"), "별표 없는 말 * 하나는 그대로");
});

test("타로·사주 공유 글과 카톡 설명은 별표를 뺀 한마디를 쓴다", () => {
  for (const f of ["components/tarot/TarotShareButtons.tsx", "components/saju/ShareButtons.tsx"]) {
    assert.match(src(f), /closingLine: rawClosingLine,/, f);
    assert.match(src(f), /const closingLine = rawClosingLine && stripEmphasisMarks\(rawClosingLine\);/, f);
  }
});

test("타로·사주 공유 그림은 글자 수로 자르기 전에 별표를 뺀다", () => {
  for (const f of ["app/api/og/tarot/[readingId]/route.tsx", "app/api/og/saju/[readingId]/route.tsx"]) {
    assert.match(src(f), /const closingLine = stripEmphasisMarks\(\n\s*extractClosingLine\(/, f);
  }
});
