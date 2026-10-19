import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_RETRY_NUDGE, systemDynamicForAttempt } from "@/lib/claude/empty-retry";

test("첫 시도·에러 재시도는 동적 블록 그대로", () => {
  assert.equal(systemDynamicForAttempt("턴 정보", false), "턴 정보");
  assert.equal(systemDynamicForAttempt("", false), "");
});

test("빈 완료 뒤 재시도는 동적 블록 끝에 빈 답 금지 지시를 붙인다", () => {
  assert.equal(systemDynamicForAttempt("턴 정보", true), `턴 정보\n\n${EMPTY_RETRY_NUDGE}`);
  assert.equal(systemDynamicForAttempt("", true), EMPTY_RETRY_NUDGE);
});
