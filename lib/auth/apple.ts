// 애플 로그인 — identityToken 검증, client_secret 서명, 인가 코드 교환(리프레시 토큰), 토큰 revoke.
// 앱(네이티브)은 aud = 번들 ID, 웹은 aud = Services ID. 탈퇴 때 revoke 하려면 리프레시 토큰을 받아 둬야 한다(애플 요구).
// 네트워크·키는 인자로 주입할 수 있다(테스트). 운영은 기본값(애플 공개키·process.env)을 쓴다.
import { createHash } from "node:crypto";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";

export const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

let remoteKeys: JWTVerifyGetKey | null = null;
function appleKeys(): JWTVerifyGetKey {
  remoteKeys ??= createRemoteJWKSet(new URL(APPLE_KEYS_URL));
  return remoteKeys;
}

/** 앱이 만든 무작위 nonce → 애플에 넘긴 값(sha256 hex). 애플은 받은 값을 토큰의 nonce 에 그대로 넣는다 */
export function appleNonceHash(rawNonce: string): string {
  return createHash("sha256").update(rawNonce).digest("hex");
}

export async function verifyAppleIdentityToken(
  idToken: string,
  opts: { audience: string; expectedNonce: string; keys?: JWTVerifyGetKey; nowSec?: number },
): Promise<{ sub: string } | null> {
  if (!idToken || !opts.audience || !opts.expectedNonce) return null;
  try {
    const { payload } = await jwtVerify(idToken, opts.keys ?? appleKeys(), {
      issuer: APPLE_ISSUER,
      audience: opts.audience,
      algorithms: ["RS256"],
      ...(opts.nowSec !== undefined ? { currentDate: new Date(opts.nowSec * 1000) } : {}),
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
    if (payload.nonce !== opts.expectedNonce) return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}

type AppleEnv = { APPLE_TEAM_ID?: string; APPLE_KEY_ID?: string; APPLE_PRIVATE_KEY?: string };

export async function appleClientSecret(
  clientId: string,
  env: AppleEnv = process.env,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const { APPLE_TEAM_ID: teamId, APPLE_KEY_ID: keyId, APPLE_PRIVATE_KEY: pem } = env;
  if (!teamId || !keyId || !pem) throw new Error("APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY not set");
  // Vercel env 에 한 줄로 넣으면 줄바꿈이 '\n' 문자열로 남는다 — 되돌린다
  const key = await importPKCS8(pem.replace(/\\n/g, "\n"), "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + 300)
    .setAudience(APPLE_ISSUER)
    .setSubject(clientId)
    .sign(key);
}

export async function exchangeAppleCode(
  code: string,
  clientId: string,
  opts: { redirectUri?: string; clientSecret?: string; fetchImpl?: FetchLike } = {},
): Promise<{ refreshToken: string } | null> {
  if (!code) return null;
  const secret = opts.clientSecret ?? (await appleClientSecret(clientId));
  const body = new URLSearchParams({ client_id: clientId, client_secret: secret, code, grant_type: "authorization_code" });
  if (opts.redirectUri) body.set("redirect_uri", opts.redirectUri);
  const res = await (opts.fetchImpl ?? fetch)(APPLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { refresh_token?: unknown } | null;
  return typeof data?.refresh_token === "string" && data.refresh_token ? { refreshToken: data.refresh_token } : null;
}

export async function revokeAppleToken(
  refreshToken: string,
  clientId: string,
  opts: { clientSecret?: string; fetchImpl?: FetchLike } = {},
): Promise<boolean> {
  const secret = opts.clientSecret ?? (await appleClientSecret(clientId));
  const res = await (opts.fetchImpl ?? fetch)(APPLE_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, token: refreshToken, token_type_hint: "refresh_token" }),
  });
  return res.ok;
}
