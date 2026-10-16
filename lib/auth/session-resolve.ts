// 세션 회원 결정(순수) — lib/session.ts 의 getSession 이 쓴다. 세 갈래는 session-resolve.test.ts 가 고정한다.
// Bearer(앱 토큰)가 있으면 토큰 검증 결과만 본다 — 실패면 비로그인(쿠키로 넘어가지 않는다:
// 안드로이드는 앱 쪽 호출에도 웹뷰 쿠키가 실려, 넘어가면 토큰 만료·설정 오류가 가려진다). 스펙 2026-10-12-앱-1 §7-4.
// Bearer 가 없으면 쿠키 — 서명 없는 users.id 라 형식(UUID) 검증으로 위조·주입을 거른다(lib/session-id.ts).
import { isValidSessionId } from "../session-id.ts";

export function resolveSessionUserId(input: {
  /** Authorization: Bearer 가 있었나 */
  hasBearer: boolean;
  /** 토큰 검증 결과(통과면 회원 ID, 아니면 null) — hasBearer 가 false 면 보지 않는다 */
  tokenUserId: string | null;
  /** byeolkong_user_id 쿠키 원문 */
  cookieUserId: string | undefined;
}): string | null {
  if (input.hasBearer) return input.tokenUserId;
  return isValidSessionId(input.cookieUserId) ? input.cookieUserId : null;
}
