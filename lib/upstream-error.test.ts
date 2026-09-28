import { test } from "node:test";
import assert from "node:assert/strict";
import { isRetryableUpstreamError, isTransientConnectionError, upstreamErrorType } from "./upstream-error.ts";

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

/**
 * 연결 단절(2026-09-28 prod, /api/relationship/chat "TypeError: terminated").
 *
 * ⚠️ 아래 픽스처는 **실측 모양의 복제**다 — 소켓을 실제로 끊어 받은 객체의 필드를 그대로 옮겼다
 *    (lib/claude/adapters/connection-retry.test.ts 가 실물로 같은 걸 검증한다). 손으로 모양을
 *    지어내다 틀린 전례가 바로 위 "연결/타임아웃 오류는 재시도 대상" 테스트다 — SDK 에러의
 *    실제 name 은 "APIConnectionError" 가 아니라 "Error" 라서 실물은 한 번도 안 잡혔었다.
 */
function terminatedMidStream() {
  const cause = Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" });
  Object.defineProperty(cause, "name", { value: "SocketError" });
  return Object.assign(new TypeError("terminated"), { cause });
}

class APIConnectionError extends Error {} // SDK 와 동일하게 name 을 설정하지 않는다

test("응답 도중 소켓 단절(TypeError: terminated)은 재시도 대상", () => {
  const err = terminatedMidStream();
  assert.equal(err.name, "TypeError");
  assert.equal((err as { status?: number }).status, undefined);
  assert.equal(isTransientConnectionError(err), true);
  assert.equal(isRetryableUpstreamError(err), true);
});

test("SDK 연결 에러는 name 이 'Error' 라도 constructor 로 잡는다", () => {
  const err = new APIConnectionError("Connection error.");
  assert.equal(err.name, "Error", "SDK 에러 클래스는 name 을 설정하지 않는다");
  assert.equal(isRetryableUpstreamError(err), true);
});

test("cause 체인 안쪽의 연결 코드도 잡는다", () => {
  const err = new Error("upstream 실패");
  (err as { cause?: unknown }).cause = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });
  assert.equal(isRetryableUpstreamError(err), true);
});

test("중단(abort)은 재시도 안 함 — 떠난 유저에게 토큰을 더 쓰지 않는다", () => {
  assert.equal(isTransientConnectionError(Object.assign(new Error("aborted"), { code: "UND_ERR_ABORTED" })), false);
  const abort = new Error("This operation was aborted");
  Object.defineProperty(abort, "name", { value: "AbortError" });
  assert.equal(isTransientConnectionError(abort), false);
});

test("연결 오류가 아닌 일반 에러는 그대로 재시도 안 함", () => {
  assert.equal(isTransientConnectionError(new Error("empty_assistant_stream")), false);
  assert.equal(isTransientConnectionError(new TypeError("x is not a function")), false);
  assert.equal(isTransientConnectionError(null), false);
});
