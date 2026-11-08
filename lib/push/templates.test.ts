import { test } from "node:test";
import assert from "node:assert/strict";
import { revisitMessage, readingPath, reconfirmMessage, promoWordsIn, PROMO_WORDS } from "./templates.ts";

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

test("정보성 틀 전부 — 판촉 단어·(광고) 없음(재확인 통지 포함)", () => {
  for (const { title, body } of [revisitMessage(), reconfirmMessage("2026년 11월 8일")]) {
    assert.deepEqual(promoWordsIn(title + " " + body), [], `${title} / ${body}`);
    assert.ok(!title.includes("(광고)") && !body.includes("(광고)"));
  }
});

test("재확인 통지 — 전송자·동의 날짜·끄는 법", () => {
  const m = reconfirmMessage("2026년 11월 8일");
  assert.ok(m.body.includes("별콩톡"));
  assert.ok(m.body.includes("2026년 11월 8일"));
  assert.ok(m.body.includes("알림 설정"));
});

test("판촉 단어 찾기 — 이름 속 '별'은 빼고, 재화 '별'은 잡는다", () => {
  assert.deepEqual(promoWordsIn("별콩톡에서 알려줄게"), []);
  assert.deepEqual(promoWordsIn("별콩이가 별 10개 줄게"), ["별"]);
  assert.deepEqual(promoWordsIn("별마루 할인"), ["할인"]);
  assert.deepEqual(promoWordsIn("무료 체험 끝나기 전"), ["체험", "무료"]);
});
