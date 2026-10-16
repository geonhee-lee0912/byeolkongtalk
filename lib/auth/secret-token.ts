// 앱 리프레시 토큰·교환 코드 — 무작위 원본은 기기(또는 웹뷰 요청 헤더)에만, DB 엔 sha256 해시만 남긴다.
import { createHash, randomBytes } from "node:crypto";

/** 리프레시 토큰 수명 90일 */
export const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** 교환 코드 수명 60초 — 앱이 받자마자 웹뷰 요청 헤더로 넘긴다(주소엔 싣지 않는다 — app/api/auth/app/handoff) */
export const HANDOFF_TTL_MS = 60 * 1000;

export function newSecretToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSecretToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
