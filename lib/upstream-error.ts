// upstream LLM 에러 분류 — streamChat 재시도 판정용. 연결 오류 판별은 프로바이더 공통이라
// anthropic·openai·gemini 어댑터가 모두 이 파일의 isTransientConnectionError 를 쓴다.
//
// 배경(2026-08-04 prod, /api/consultations/tarot/chat overloaded_error):
// overloaded_error 는 API 가 HTTP 200 으로 스트림을 연 뒤 SSE `error` 이벤트로 보내는
// 일시적 과부하 신호다. SDK 의 자동 재시도는 *초기 연결*(HTTP 요청)만 감싸므로, 200 이후
// 스트림 도중 오는 이 에러는 재시도되지 않고 그대로 던져진다
// (@anthropic-ai/sdk core/streaming.js: `if (sse.event === 'error') throw new APIError(...)`).
// 이 구멍은 streamChat 이 메운다 — 첫 조각 방출 전이면 안전하게 재호출.
//
// instanceof(APIError) 대신 형태(shape)로 판별한다 — 번들 중복 등으로 클래스 아이덴티티가
// 갈라져도 안전하고, 이 파일은 SDK·Supabase 를 import 하지 않아 순수 유닛 테스트가 된다.

/** SDK APIError 의 error.type(예: "overloaded_error")을 추출. 없으면 name → "unknown". */
export function upstreamErrorType(err: unknown): string {
  if (!err || typeof err !== "object") return "unknown";
  const e = err as { type?: unknown; error?: { type?: unknown }; name?: unknown };
  if (typeof e.type === "string") return e.type;
  const body = e.error;
  if (
    body &&
    typeof body === "object" &&
    typeof (body as { type?: unknown }).type === "string"
  ) {
    return (body as { type: string }).type;
  }
  if (typeof e.name === "string") return e.name;
  return "unknown";
}

/** undici 는 `UND_ERR_*`, Node 소켓은 E* 코드를 쓴다. 둘 다 "연결이 끊겼다"는 뜻. */
const CONNECTION_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "EPIPE",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

/** undici 가 응답 body 를 끊을 때 붙이는 메시지 — 네트워크 실패 외의 의미가 없다. */
const UNDICI_FAILURE_MESSAGES = new Set(["terminated", "fetch failed"]);

/** 유저/우리가 의도적으로 끊은 것 — 재시도하면 떠난 유저에게 토큰만 더 쓴다. */
function isAbort(name: string, code: string): boolean {
  return name === "AbortError" || code === "ABORT_ERR" || code === "UND_ERR_ABORTED";
}

/**
 * 업스트림 **연결**이 끊긴 것인지 — 응답 도중 소켓 단절, 연결 실패, DNS·타임아웃.
 *
 * 🔴 `name` 으로 판별하면 안 된다. openai·anthropic SDK 의 에러 클래스는 전부 `name` 을
 *    설정하지 않아 실제 값이 "Error" 다(2026-09-28 실측). `{ name: "APIConnectionError" }`
 *    같은 손으로 지어낸 모양만 잡히고 실물은 한 번도 안 잡혔다 → 클래스는 constructor.name
 *    으로 본다(instanceof 는 번들 중복에 약해 이 파일의 shape 판별 원칙과도 맞다).
 *
 * 원인은 보통 한 겹 안에 있으므로(예: APIConnectionError → TypeError: fetch failed,
 * TypeError: terminated → SocketError UND_ERR_SOCKET) cause 체인을 따라 내려간다.
 */
export function isTransientConnectionError(err: unknown, depth = 0): boolean {
  if (!err || typeof err !== "object" || depth > 3) return false;
  const e = err as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    cause?: unknown;
    constructor?: { name?: unknown };
  };

  const name = typeof e.name === "string" ? e.name : "";
  const code = typeof e.code === "string" ? e.code : "";
  if (isAbort(name, code)) return false;

  const ctor = typeof e.constructor?.name === "string" ? e.constructor.name : "";
  if (ctor === "APIConnectionError" || ctor === "APIConnectionTimeoutError" || ctor === "SocketError") {
    return true;
  }
  // name 을 설정하는 구현(과거 호환·타 SDK)도 함께 받아준다.
  if (name === "APIConnectionError" || name === "APIConnectionTimeoutError") return true;

  if (code.startsWith("UND_ERR_") || CONNECTION_ERROR_CODES.has(code)) return true;

  const message = typeof e.message === "string" ? e.message : "";
  if (name === "TypeError" && UNDICI_FAILURE_MESSAGES.has(message)) return true;

  return isTransientConnectionError(e.cause, depth + 1);
}

/**
 * 재시도 가치가 있는 일시적 upstream 에러인지 — overloaded_error·api_error·429·5xx·연결 오류.
 * 클라이언트/설정 오류(400/401/403/404/422)는 재시도해도 소용없으니 false.
 */
export function isRetryableUpstreamError(err: unknown): boolean {
  const type = upstreamErrorType(err);
  if (type === "overloaded_error" || type === "api_error") return true;

  const status = (err as { status?: unknown } | null | undefined)?.status;
  if (typeof status === "number" && (status === 429 || status >= 500)) return true;

  // 연결/타임아웃 오류 — status 가 없어 위 분기로는 안 잡힌다.
  return isTransientConnectionError(err);
}
