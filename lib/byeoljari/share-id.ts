import { randomBytes } from "node:crypto";

const ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"; // base62

/**
 * URL 친화 공유 코드. 재미 콘텐츠용이라 rejection-sampling 없이 modulo 매핑
 * (미미한 편향 허용). 충돌은 호출측이 UNIQUE 위반 시 재생성으로 처리.
 */
export function generateShareId(len = 10): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % 62];
  return out;
}
