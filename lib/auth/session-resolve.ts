// 세션 회원 결정(순수) — lib/session.ts 의 getSession 이 쓴다. 규칙은 session-resolve.test.ts, getSession 연결부는 lib/session.test.ts 가 고정한다.
// Bearer(앱 토큰)면 토큰 검증 결과만 본다 — 실패면 비로그인(쿠키로 넘어가지 않는다:
// 안드로이드는 앱 쪽 호출에도 웹뷰 쿠키가 실려, 넘어가면 토큰 만료·설정 오류가 가려진다). 스펙 2026-10-12-앱-1 §7-4.
// 토큰이 비었거나 형식이 틀린 Bearer(`Bearer`·`Bearer a b`)도 Bearer 로 친다 — 앱이 토큰을 붙이려다 실패한 것이라 쿠키로 넘어가면 같은 문제가 가려진다.
// Bearer 가 아니면(헤더 없음·Basic 같은 다른 방식) 쿠키 — 서명 없는 users.id 라 형식(UUID) 검증으로 위조·주입을 거른다(lib/session-id.ts).
import { isValidSessionId } from "../session-id.ts";

/** Authorization 이 Bearer 방식인가 — 토큰 형식은 안 본다(parseBearer 가 토큰을 꺼내는 헤더는 전부 true) */
export function isBearerScheme(authorization: string | null | undefined): boolean {
  return !!authorization && /^Bearer(?:\s|$)/i.test(authorization.trim());
}

export function resolveSessionUserId(input: {
  /** Authorization 이 Bearer 방식이었나(isBearerScheme) — 토큰이 비었거나 형식이 틀려도 true */
  hasBearer: boolean;
  /** 토큰 검증 결과(통과면 회원 ID, 아니면 null) — hasBearer 가 false 면 보지 않는다 */
  tokenUserId: string | null;
  /** byeolkong_user_id 쿠키 원문 */
  cookieUserId: string | undefined;
}): string | null {
  if (input.hasBearer) return input.tokenUserId;
  return isValidSessionId(input.cookieUserId) ? input.cookieUserId : null;
}
