import { test } from "node:test";
import assert from "node:assert/strict";
import { chatErrorKr } from "./chat-errors.ts";

test("chatErrorKr — 알려진 코드는 한글 문구", () => {
  assert.equal(
    chatErrorKr("messages_too_long"),
    "이 대화가 많이 길어졌어. 새 상담으로 이어가 볼까?"
  );
  assert.equal(
    chatErrorKr("rate_limited"),
    "잠깐 사이에 너무 많이 보냈어. 조금 뒤에 다시 해줄래?"
  );
});

test("chatErrorKr — 미지 코드/비문자열은 폴백", () => {
  const fallback = "연결이 흔들렸어. 잠시 후 다시 시도해줄래?";
  assert.equal(chatErrorKr("unknown_code"), fallback);
  assert.equal(chatErrorKr(undefined), fallback);
  assert.equal(chatErrorKr(null), fallback);
  assert.equal(chatErrorKr(42), fallback);
});
