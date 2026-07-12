import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getSuggestions,
  shouldShowSuggestions,
  SAJU_SUGGESTIONS,
  TAROT_SUGGESTIONS,
} from "./suggestions.ts";

test("getSuggestions — 타입별 세트 반환", () => {
  assert.equal(getSuggestions("saju"), SAJU_SUGGESTIONS);
  assert.equal(getSuggestions("tarot"), TAROT_SUGGESTIONS);
  assert.ok(SAJU_SUGGESTIONS.length >= 2);
  assert.ok(TAROT_SUGGESTIONS.length >= 2);
});

test("shouldShowSuggestions — 첫 풀이 직후에만 true", () => {
  assert.equal(
    shouldShowSuggestions({ assistantCount: 1, isStreaming: false, isEnded: false }),
    true
  );
  assert.equal(
    shouldShowSuggestions({ assistantCount: 0, isStreaming: true, isEnded: false }),
    false
  );
  assert.equal(
    shouldShowSuggestions({ assistantCount: 2, isStreaming: false, isEnded: false }),
    false
  );
  assert.equal(
    shouldShowSuggestions({ assistantCount: 1, isStreaming: true, isEnded: false }),
    false
  );
  assert.equal(
    shouldShowSuggestions({ assistantCount: 1, isStreaming: false, isEnded: true }),
    false
  );
});
