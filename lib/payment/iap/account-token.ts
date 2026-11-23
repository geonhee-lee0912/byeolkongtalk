// 스토어 계정 토큰 — 앱이 결제할 때 애플 appAccountToken · 구글 obfuscatedAccountId 에 같은 값을 싣는다.
// 서버는 스토어가 돌려준 값이 지금 로그인한 회원의 것인지 대조한다(결제 중 로그아웃 → 다른 회원 로그인 뒤 재전송을 막으려고).
// 회원 id 를 그대로 싣지 않는다(스토어에 우리 회원 id 가 남지 않게) — 서버 비밀값 HMAC 이라 남이 만들 수 없다.
import { createHmac } from "node:crypto";

const MIN_SECRET_LEN = 32; // 앱 토큰(lib/auth/app-token.ts)과 같은 기준

/** HMAC-SHA256(APP_ACCESS_TOKEN_SECRET, "iap:"+userId) 앞 16바이트를 UUID v4 모양 소문자 문자열로(애플은 UUID 만 받는다) */
export function iapAccountToken(userId: string, secret: string | undefined = process.env.APP_ACCESS_TOKEN_SECRET): string {
  if (!secret || secret.length < MIN_SECRET_LEN) throw new Error("APP_ACCESS_TOKEN_SECRET not set or too short (min 32 chars)");
  const b = createHmac("sha256", secret).update(`iap:${userId}`).digest().subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x40; // 버전 4
  b[8] = (b[8] & 0x3f) | 0x80; // 변형 10xx
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
