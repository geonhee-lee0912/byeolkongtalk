import { test } from "node:test";
import assert from "node:assert/strict";
import { isRetryableUpstreamError, upstreamErrorType } from "./upstream-error.ts";

/**
 * 회귀 방지: 2026-08-04 prod overloaded_error(/api/consultations/tarot/chat)는
 * SDK 가 SSE `error` 이벤트를 받아 `new APIError(undefined, body, undefined, headers,
 * "overloaded_error")` 로 던진 것 — status 는 undefined, type 은 "overloaded_error".
 * streamChat 재시도가 이 형태를 반드시 재시도 대상으로 잡아야 한다.
 */

// prod 에서 실제로 던져진 APIError 형태 재현.
function overloadedInStreamError() {
  const body = {
    type: "error",
    error: { details: null, type: "overloaded_error", message: "Overloaded" },
  };
  return Object.assign(new Error(JSON.stringify(body)), {
    status: undefined, // in-stream error event → status 없음
    type: "overloaded_error",
    error: body,
  });
}

test("overloaded_error(in-stream, status 없음)는 재시도 대상", () => {
  const err = overloadedInStreamError();
  assert.equal(upstreamErrorType(err), "overloaded_error");
  assert.equal(isRetryableUpstreamError(err), true);
});

test("초기 연결 5xx(529/503/500)는 재시도 대상", () => {
  assert.equal(isRetryableUpstreamError({ status: 529, type: "overloaded_error" }), true);
  assert.equal(isRetryableUpstreamError({ status: 503 }), true);
  assert.equal(isRetryableUpstreamError({ status: 500, type: "api_error" }), true);
});

test("429(rate limit)은 재시도 대상", () => {
  assert.equal(isRetryableUpstreamError({ status: 429, type: "rate_limit_error" }), true);
});

test("연결/타임아웃 오류는 재시도 대상", () => {
  assert.equal(isRetryableUpstreamError({ name: "APIConnectionError" }), true);
  assert.equal(isRetryableUpstreamError({ name: "APIConnectionTimeoutError" }), true);
});

test("body.error.type 폴백으로도 overloaded 를 잡는다", () => {
  assert.equal(isRetryableUpstreamError({ error: { type: "overloaded_error" } }), true);
});

test("클라이언트/설정 오류(400/401/403/404/422)는 재시도 안 함", () => {
  for (const status of [400, 401, 403, 404, 422]) {
    assert.equal(
      isRetryableUpstreamError({ status, type: "invalid_request_error" }),
      false,
      `status ${status} 은 재시도 대상이 아니어야 함`
    );
  }
});

test("일반 에러·null·undefined 는 재시도 안 함", () => {
  assert.equal(isRetryableUpstreamError(new Error("boom")), false);
  assert.equal(isRetryableUpstreamError(null), false);
  assert.equal(isRetryableUpstreamError(undefined), false);
  assert.equal(upstreamErrorType(null), "unknown");
});

test("내부 가드 에러(empty_assistant_stream)는 재시도 안 함 — 무한 재시도 방지", () => {
  assert.equal(isRetryableUpstreamError(new Error("empty_assistant_stream")), false);
});
