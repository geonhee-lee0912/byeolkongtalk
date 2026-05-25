// 어드민 쿠키 서명/검증 — HMAC-SHA256
// Edge runtime + Node runtime 모두에서 동작 (Web Crypto API 사용).
//
// 용도: ADMIN_USER_IDS 화이트리스트 유저만 발급받는 별도 어드민 인증 토큰.
// USER_COOKIE 위조에 대한 방어층 — 서명을 만들 수 없으면 어드민 권한 못 얻음.

const ADMIN_TOKEN_COOKIE = "byeolkong_admin_token";

function getSecret(): string {
  const s = process.env.AUTH_TOKEN_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "AUTH_TOKEN_SECRET env not set or too short (min 32 chars). Required for admin cookie signing."
    );
  }
  return s;
}

async function hmacHex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(input));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * 어드민 토큰 발급 — userId 를 HMAC-SHA256 으로 서명한 hex 32자.
 * AUTH_TOKEN_SECRET 가진 서버만 발급 가능 → 클라 위조 불가.
 */
export async function signAdminToken(userId: string): Promise<string> {
  const sig = await hmacHex(userId);
  return sig.slice(0, 32);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * 어드민 토큰 검증. SECRET 미설정 / 예외 시 false (fail-closed).
 */
export async function verifyAdminToken(
  userId: string | null | undefined,
  token: string | null | undefined
): Promise<boolean> {
  if (!userId || !token) return false;
  try {
    const expected = await signAdminToken(userId);
    return timingSafeEqual(expected, token);
  } catch {
    return false;
  }
}

export const ADMIN_TOKEN_COOKIE_NAME = ADMIN_TOKEN_COOKIE;
