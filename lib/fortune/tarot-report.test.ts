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

test("문자열 안 escape 안 된 내부 큰따옴표를 복구해 파싱 (재현 케이스)", () => {
  // 모델이 조언에 대화 인용을 escape 없이 넣은 상황: ..."요즘 어때?" 같은...
  // 기존엔 JSON.parse "Expected ',' or '}'" 로 실패 → null → 리포트 전체 폐기.
  const raw =
    '{"headline":"h","cards":[{"position":"p","cardName":"c","direction":"upright","reading":"r"}],"summary":"s","advice":"가볍게 "요즘 어때?" 같은 말로 문을 열어봐."}';
  const ai = parseTarotReportJson(raw);
  assert.ok(ai, "내부 따옴표를 복구해서 파싱해야 한다");
  assert.match(ai.advice, /요즘 어때/);
});

test("코드펜스로 감싸도 파싱", () => {
  const raw =
    '```json\n{"headline":"h","cards":[{"position":"p","cardName":"c","direction":"upright","reading":"r"}],"summary":"s","advice":"a"}\n```';
  assert.ok(parseTarotReportJson(raw));
});

test("advice 누락 시 리포트를 버리지 않고 빈 문자열로 폴백 (재현 케이스)", () => {
  // 모델이 advice 필드를 통째로 누락(연애운 재현율 ~37%). 카드·summary 는 완결.
  const raw = JSON.stringify({
    headline: "설레는 나, 흔들리는 너",
    cards: [validCard],
    summary: "종합 해석.",
  });
  const ai = parseTarotReportJson(raw);
  assert.ok(ai, "advice 없어도 완결 리포트는 파싱돼야 한다");
  assert.equal(ai.advice, "");
  assert.equal(ai.cards.length, 1);
});

test("완전히 깨진 입력은 null", () => {
  assert.equal(parseTarotReportJson("그냥 텍스트, JSON 없음"), null);
});
