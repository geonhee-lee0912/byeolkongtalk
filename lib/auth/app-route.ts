// 앱 로그인·토큰 라우트와 애플 로그인 라우트 공용 — 본문 읽기, 플랫폼, 속도 제한, no-store, 로그인 성공 응답, 애플 리프레시 토큰 보관.
// 스펙 2026-10-12-앱-1 §7-3·§7-4.
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import { logError, logWarn, ctxFromRequest } from "@/lib/logger";
import { createHandoffCode, issueAppTokens, type Platform } from "./app-session";
import { supabaseAppSessionStore } from "./app-session-store";
import { exchangeAppleCode } from "./apple";
import { encryptSecret } from "./token-crypto";

export async function readJson(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function parsePlatform(v: unknown): Platform | null {
  return v === "ios" || v === "android" ? v : null;
}

/** IP 기준 속도 제한(인스턴스 메모리 — 1차 방어선, lib/ratelimit.ts). 걸리면 429 응답, 통과면 null */
export function rateLimited(request: NextRequest, namespace: string, max = 20, windowMs = 60_000): NextResponse | null {
  const r = checkRateLimit({ namespace, key: getClientIp(request), max, windowMs });
  if (r.ok) return null;
  return NextResponse.json(
    { error: "rate_limited" },
    { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000))) } },
  );
}

/** 토큰·교환 코드가 실린 응답 — 캐시·리퍼러에 남지 않게 */
export function noStore<T extends NextResponse>(res: T): T {
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

/** 앱 로그인 성공 — 앱 토큰 + 웹뷰 교환 코드 */
export async function appLoginResponse(userId: string, isNewUser: boolean, platform: Platform | null): Promise<NextResponse> {
  const store = supabaseAppSessionStore();
  const tokens = await issueAppTokens(store, userId, platform);
  const handoffCode = await createHandoffCode(store, userId, isNewUser);
  return noStore(
    NextResponse.json({
      accessToken: tokens.accessToken,
      accessExpiresAt: tokens.accessExpiresAt,
      accessExpiresIn: tokens.accessExpiresIn,
      refreshToken: tokens.refreshToken,
      handoffCode,
      isNewUser,
    }),
  );
}

/** 애플 인가 코드 → 리프레시 토큰 → 암호화. 실패하면 null(로그인은 진행 — 대신 탈퇴 때 revoke 를 못 하니 로그를 남긴다) */
export async function appleRefreshTokenEnc(
  code: string,
  clientId: string,
  redirectUri: string | undefined,
  request: NextRequest,
  route: string,
): Promise<string | null> {
  if (!code) {
    await logWarn("Apple authorization code missing — no refresh token", ctxFromRequest(request, { route }));
    return null;
  }
  try {
    const exchanged = await exchangeAppleCode(code, clientId, { redirectUri });
    if (!exchanged) {
      // 코드 만료·재사용(invalid_grant) — 가입마다 이게 나오면 client_id·redirect_uri 설정도 의심할 것
      await logWarn("Apple code exchange rejected (invalid_grant) — no refresh token", ctxFromRequest(request, { route }));
      return null;
    }
    return encryptSecret(exchanged.refreshToken);
  } catch (err) {
    // env·키 설정 오류(APPLE_PRIVATE_KEY·APPLE_TOKEN_ENC_KEY 등)·invalid_client·애플 장애·타임아웃 — 모든 애플 가입이 revoke 불가가 될 수 있으니 error 로
    await logError(err, ctxFromRequest(request, { route, extra: { step: "apple_code_exchange" } }));
    return null;
  }
}
