// Anthropic(upstream LLM) 에러 분류 — streamChat 재시도 판정용.
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

/**
 * 재시도 가치가 있는 일시적 upstream 에러인지 — overloaded_error·api_error·429·5xx·연결 오류.
 * 클라이언트/설정 오류(400/401/403/404/422)는 재시도해도 소용없으니 false.
 */
export function isRetryableUpstreamError(err: unknown): boolean {
  const type = upstreamErrorType(err);
  if (type === "overloaded_error" || type === "api_error") return true;

  const status = (err as { status?: unknown } | null | undefined)?.status;
  if (typeof status === "number" && (status === 429 || status >= 500)) return true;

  // 연결/타임아웃 오류 — status 없음, name 으로 판별.
  if (type === "APIConnectionError" || type === "APIConnectionTimeoutError")
    return true;

  return false;
}
