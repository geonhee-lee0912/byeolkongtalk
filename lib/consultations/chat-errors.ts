// chat(타로/사주) 서버 에러 코드 → 별콩이 톤 한글 문구.
// 클라가 raw 코드("messages_too_long" 등)를 그대로 화면에 노출하던 문제 방지.

export const CHAT_ERROR_KR: Record<string, string> = {
  messages_too_long: "이 대화가 많이 길어졌어. 새 상담으로 이어가 볼까?",
  rate_limited: "잠깐 사이에 너무 많이 보냈어. 조금 뒤에 다시 해줄래?",
  invalid_message_format: "메시지 형식이 올바르지 않아. 다시 시도해줄래?",
  invalid_json: "요청이 잘못 전달됐어. 다시 시도해줄래?",
  messages_required: "메시지를 입력해줘.",
  last_must_be_user: "잠깐 문제가 생겼어. 다시 보내줄래?",
  readingId_required: "상담 정보를 찾을 수 없어. 새로 시작해줄래?",
  reading_not_found: "상담을 찾을 수 없어. 새로 시작해줄래?",
};

const FALLBACK = "연결이 흔들렸어. 잠시 후 다시 시도해줄래?";

/** 서버가 준 error 코드를 한글 문구로. 미지/비문자열은 폴백. */
export function chatErrorKr(code: unknown): string {
  if (typeof code === "string" && code in CHAT_ERROR_KR) {
    return CHAT_ERROR_KR[code];
  }
  return FALLBACK;
}
