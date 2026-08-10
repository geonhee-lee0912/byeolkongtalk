// lib/claude/adapters/parse.test.ts
// 스트림 파싱 순수 함수(finish_reason → StopReason)만 단위 테스트 — SDK 호출과 분리.
// NOTE: 플랜 스니펫은 vitest 로 적혀 있으나, 이 리포의 유닛 러너는 node:test 다
// (.github/workflows/test.yml 이 qa/ 제외 모든 *.test.ts 를 `node --import tsx --test` 로 실행).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapOpenAIFinish } from "./openai.ts";

describe("openai finish 매핑", () => {
  it("stop→end_turn, length→max_tokens, content_filter→refusal", () => {
    assert.equal(mapOpenAIFinish("stop"), "end_turn");
    assert.equal(mapOpenAIFinish("length"), "max_tokens");
    assert.equal(mapOpenAIFinish("content_filter"), "refusal");
    assert.equal(mapOpenAIFinish(null), null);
    assert.equal(mapOpenAIFinish("tool_calls"), "other");
  });
});
