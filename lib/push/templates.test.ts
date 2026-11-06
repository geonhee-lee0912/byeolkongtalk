import { test } from "node:test";
import assert from "node:assert/strict";
import { revisitMessage, readingPath, PROMO_WORDS } from "./templates.ts";

test("정보성 문구에 판촉 단어·(광고)가 없다", () => {
  const { title, body } = revisitMessage();
  for (const w of [...PROMO_WORDS, "(광고)"]) assert.ok(!title.includes(w) && !body.includes(w), w);
  assert.equal(title, "다시 볼 날이야");
  assert.equal(body, "그때 그 리딩, 오늘 다시 펼쳐 볼래?");
});

test("리딩 경로", () => {
  assert.equal(readingPath("tarot", "r1"), "/tarot/result?id=r1");
  assert.equal(readingPath("saju", "r1"), "/saju/result?id=r1");
  assert.equal(readingPath("relationship", "r1"), null);
});
