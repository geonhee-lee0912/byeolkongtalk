// 앱 액세스 토큰 — 앱(React Native) 쪽이 서버를 부를 때 쓰는 1시간짜리 서명 토큰.
// 웹뷰는 쿠키(byeolkong_user_id)를 쓰고 앱 쪽 호출은 이 토큰을 쓴다(iOS 는 웹뷰와 앱의 쿠키 저장소가 따로고, 안드로이드는 공유될 수 있어 쿠키에 기대지 않는다).
// 서명 비밀값(APP_ACCESS_TOKEN_SECRET)은 어드민 토큰(AUTH_TOKEN_SECRET)과 분리한다 — 따로 교체할 수 있게.
import { SignJWT, jwtVerify } from "jose";
import { isValidSessionId } from "../session-id.ts";

const ISSUER = "byeolkongtalk";
const AUDIENCE = "byeolkong-app";
const VERSION = 1;
export const ACCESS_TTL_SEC = 60 * 60;
const MIN_SECRET_LEN = 32;

function usableSecret(secret: string | undefined): secret is string {
  return typeof secret === "string" && secret.length >= MIN_SECRET_LEN;
}

function secretKey(secret: string | undefined): Uint8Array {
  if (!usableSecret(secret)) {
    throw new Error("APP_ACCESS_TOKEN_SECRET not set or too short (min 32 chars)");
  }
  return new TextEncoder().encode(secret);
}

/** 운영 서명 비밀값(APP_ACCESS_TOKEN_SECRET)을 쓸 수 있나 — 앱 로그인 라우트가 가입(signIn) 전에 본다.
 *  없거나 짧은 채로 가입까지 가면 회원·웰컴 별·CAPI 는 생기고 토큰만 못 줘 500 이 난다(/api/health 는 '있다'만 본다) */
export function appTokenSecretReady(): boolean {
  return usableSecret(process.env.APP_ACCESS_TOKEN_SECRET);
}

export async function signAccessToken(
  userId: string,
  opts: { secret?: string; nowSec?: number } = {},
): Promise<{ token: string; expiresAt: number }> {
  if (!isValidSessionId(userId)) throw new Error("signAccessToken: userId must be a users.id UUID");
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const exp = now + ACCESS_TTL_SEC;
  const token = await new SignJWT({ typ: "access", v: VERSION })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secretKey(opts.secret ?? process.env.APP_ACCESS_TOKEN_SECRET));
  return { token, expiresAt: exp * 1000 };
}

/** 통과하면 회원 ID, 아니면 null — 만료·위조·형식 오류·비밀값 없음 전부 null(fail-closed) */
export async function verifyAccessToken(
  token: string,
  opts: { secret?: string; nowSec?: number } = {},
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(opts.secret ?? process.env.APP_ACCESS_TOKEN_SECRET), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
      requiredClaims: ["exp", "iat", "sub"],
      ...(opts.nowSec !== undefined ? { currentDate: new Date(opts.nowSec * 1000) } : {}),
    });
    if (payload.typ !== "access" || payload.v !== VERSION) return null;
    return isValidSessionId(payload.sub) ? payload.sub : null;
  } catch {
    return null;
  }
}

/** "Bearer <토큰>" 헤더에서 토큰만 꺼낸다. 형식이 아니면 null */
export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m ? m[1] : null;
}
