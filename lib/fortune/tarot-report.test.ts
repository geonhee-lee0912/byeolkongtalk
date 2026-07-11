import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTarotReportJson } from "./tarot-report.ts";

const validCard = {
  position: "나의 마음",
  cardName: "The Star",
  direction: "upright",
  reading: "희망의 흐름이 보여.",
};

test("정상 JSON 파싱", () => {
  const raw = JSON.stringify({
    headline: "빛나는 흐름",
    cards: [validCard],
    summary: "종합 해석.",
    advice: "이렇게 해보면 좋아.",
  });
  const ai = parseTarotReportJson(raw);
  assert.ok(ai);
  assert.equal(ai.cards.length, 1);
});

test("summary 안 raw 개행이 있어도 복구해서 파싱 (재발 케이스)", () => {
  // 모델이 escape 안 된 실제 개행을 문자열에 넣은 상황 — 기존엔 JSON.parse 실패로 null.
  const raw =
    '{"headline":"빛나는 흐름","cards":[{"position":"나의 마음","cardName":"The Star","direction":"정방향","reading":"희망의 흐름이 보여."}],"summary":"첫 문단이야.\n\n두 번째 문단이야.","advice":"이렇게 해보면 좋아."}';
  const ai = parseTarotReportJson(raw);
  assert.ok(ai, "raw 개행 포함 JSON 을 복구 파싱해야 한다");
  assert.match(ai.summary, /두 번째 문단/);
  assert.equal(ai.cards[0].direction, "upright"); // 한글 방향 정규화
});

test("코드펜스로 감싸도 파싱", () => {
  const raw =
    '```json\n{"headline":"h","cards":[{"position":"p","cardName":"c","direction":"upright","reading":"r"}],"summary":"s","advice":"a"}\n```';
  assert.ok(parseTarotReportJson(raw));
});

test("완전히 깨진 입력은 null", () => {
  assert.equal(parseTarotReportJson("그냥 텍스트, JSON 없음"), null);
});
