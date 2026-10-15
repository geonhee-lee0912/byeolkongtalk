// 애플 로그인 — identityToken 검증, client_secret 서명, 인가 코드 교환(리프레시 토큰), 토큰 revoke.
// 앱(네이티브)은 aud = 번들 ID, 웹은 aud = Services ID. 탈퇴 때 revoke 하려면 리프레시 토큰을 받아 둬야 한다(애플 요구).
// 네트워크·키는 인자로 주입할 수 있다(테스트). 운영은 기본값(애플 공개키·process.env)을 쓴다.
// 계약(카카오 확인 kakao-verify.ts 와 같은 원칙): 토큰·코드가 나쁘면 실패 값(검증은 token_invalid·aud_mismatch, 교환은 null).
//   애플 쪽 장애(공개키 조회 실패·5xx)·우리 설정 오류(env 없음·invalid_client)·이상한 응답·네트워크 오류·타임아웃(5초)은 throw
//   — 호출 라우트가 오류 로그로 남긴다(조용히 '무효 토큰'으로 접히지 않게). revoke 는 성공이 아니면 전부 throw(탈퇴를 멈춘다).
import { createHash } from "node:crypto";
import { createRemoteJWKSet, errors, importPKCS8, jwtVerify, SignJWT, type JWTVerifyGetKey } from "jose";

export const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const TIMEOUT_MS = 5_000;

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

let remoteKeys: JWTVerifyGetKey | null = null;
function appleKeys(): JWTVerifyGetKey {
  remoteKeys ??= createRemoteJWKSet(new URL(APPLE_KEYS_URL)); // 공개키 조회 타임아웃은 jose 기본 5초
  return remoteKeys;
}

// 토큰이 나빠서 나는 jose 오류 — 아무 문자열로도 닿는다(위조·변조·형식·만료 토큰). 이것만 token_invalid.
// 공개키 조회 실패(네트워크 TypeError·JWKSTimeout·비200/JSON 아님 = 일반 JOSEError·JWKSInvalid)는 다시 던진다.
// 모르는 kid 는 jose 가 쿨다운(30초) 밖이면 공개키를 다시 받아 본다 — 그 조회가 실패하면 그 오류가 그대로 던져진다(새 키일 수 있으니 맞다).
const TOKEN_REJECTED = new Set<string>([
  errors.JWSInvalid.code,
  errors.JWTInvalid.code,
  errors.JOSEAlgNotAllowed.code, // RS256 아님 — 공개키 조회 전에 거른다
  errors.JOSENotSupported.code, // crit 에 모르는 확장
  errors.JWKSNoMatchingKey.code,
  errors.JWKSMultipleMatchingKeys.code, // kid 없음 + 애플 키 여러 개
  errors.JWSSignatureVerificationFailed.code,
  errors.JWTExpired.code,
  errors.JWTClaimValidationFailed.code, // iss·nbf·필수 클레임(aud 불일치는 catch 에서 먼저 따로 본다)
]);

export type AppleVerifyResult =
  | { ok: true; sub: string }
  | { ok: false; reason: "token_invalid" }
  // 진짜 애플 토큰(서명 통과)인데 다른 클라이언트(번들 ID·Services ID)용 — dev·prod 설정이 뒤바뀐 실수일 수 있다(카카오 app_mismatch 자리)
  | { ok: false; reason: "aud_mismatch"; aud: string };
const TOKEN_INVALID = { ok: false, reason: "token_invalid" } as const;

/** 앱이 만든 무작위 nonce → 애플에 넘긴 값(sha256 hex). 애플은 받은 값을 토큰의 nonce 에 그대로 넣는다 */
export function appleNonceHash(rawNonce: string): string {
  return createHash("sha256").update(rawNonce).digest("hex");
}

export async function verifyAppleIdentityToken(
  idToken: string,
  opts: { audience: string; expectedNonce: string; keys?: JWTVerifyGetKey; nowSec?: number },
): Promise<AppleVerifyResult> {
  if (!idToken || !opts.audience || !opts.expectedNonce) return TOKEN_INVALID;
  try {
    const { payload } = await jwtVerify(idToken, opts.keys ?? appleKeys(), {
      issuer: APPLE_ISSUER,
      audience: opts.audience,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub"],
      ...(opts.nowSec !== undefined ? { currentDate: new Date(opts.nowSec * 1000) } : {}),
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) return TOKEN_INVALID;
    if (payload.nonce !== opts.expectedNonce) return TOKEN_INVALID;
    return { ok: true, sub: payload.sub };
  } catch (err) {
    // 클레임 검사는 서명 확인 뒤에 하므로 이 aud 는 애플이 서명한 값이다
    if (err instanceof errors.JWTClaimValidationFailed && err.claim === "aud" && err.reason === "check_failed") {
      return { ok: false, reason: "aud_mismatch", aud: String(err.payload.aud).slice(0, 200) };
    }
    if (err instanceof errors.JOSEError && TOKEN_REJECTED.has(err.code)) return TOKEN_INVALID;
    throw err;
  }
}

type AppleEnv = { APPLE_TEAM_ID?: string; APPLE_KEY_ID?: string; APPLE_PRIVATE_KEY?: string };

export async function appleClientSecret(
  clientId: string,
  env: AppleEnv = process.env as AppleEnv,
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

/** 애플 오류 응답의 error 코드(없으면 null) — 로그용. 본문 전체는 싣지 않는다 */
async function appleErrorCode(res: Response): Promise<string | null> {
  const error = ((await res.json().catch(() => null)) as { error?: unknown } | null)?.error;
  return typeof error === "string" ? error.slice(0, 64) : null;
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
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const error = await appleErrorCode(res);
    // 코드 만료(5분)·재사용 = 사용자 쪽 정상 실패 → null. invalid_client(client_secret·키·팀 ID·client_id 설정 오류)·5xx 등은 throw
    if (error === "invalid_grant") return null;
    throw new Error(`apple token ${res.status} error=${error}`);
  }
  const data = (await res.json().catch(() => null)) as { refresh_token?: unknown } | null;
  // 본문엔 토큰이 들어 있으니 오류 메시지에 싣지 않는다
  if (typeof data?.refresh_token !== "string" || !data.refresh_token) throw new Error("apple token: no refresh_token in 200 response");
  return { refreshToken: data.refresh_token };
}

/** 애플 토큰 회수 — 성공이 아니면 상태·error 코드를 실어 throw(탈퇴 라우트가 로그로 남기고 탈퇴를 멈춘다) */
export async function revokeAppleToken(
  refreshToken: string,
  clientId: string,
  opts: { clientSecret?: string; fetchImpl?: FetchLike } = {},
): Promise<void> {
  const secret = opts.clientSecret ?? (await appleClientSecret(clientId));
  const res = await (opts.fetchImpl ?? fetch)(APPLE_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, token: refreshToken, token_type_hint: "refresh_token" }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`apple revoke ${res.status} error=${await appleErrorCode(res)}`);
}
