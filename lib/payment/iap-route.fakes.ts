// iap-route.test.ts 전용 가짜 — 앱 결제 확인 라우트(app/api/payment/iap/route.ts)가 import 하는
// @/lib/session · @/lib/payment/iap/apple · @/lib/payment/iap/google · @/lib/payment/grant · @/lib/logger 자리에 이 모듈 하나가 들어간다(테스트의 resolve 훅).
// 계정 토큰(lib/payment/iap/account-token.ts)·설정 확인(verify.ts)·본문 읽기·속도 제한(lib/auth/app-route.ts)·패키지 상수는 진짜가 돈다.
import type { GrantInput, GrantResult } from "./grant.ts";
import type { VerifiedPurchase } from "./iap/verify.ts";

/** QA봇 — 공개 저장소에 써도 되는 유일한 회원 id */
export const USER_ID = "11111111-1111-4111-8111-111111111111";

type LogCtx = { route?: string; userId?: string | null; extra?: Record<string, unknown> };
export type LoggedEntry = { level: "error" | "warn" | "info"; message: string; route: string | undefined; extra: Record<string, unknown> };

type State = {
  sessionUserId: string | null;
  /** 애플 확인 결과 — Error 면 throw(애플 장애·서명 검증 실패 자리), null 은 거래 없음 */
  apple: VerifiedPurchase | null | Error;
  appleCalls: string[];
  google: VerifiedPurchase | null | Error;
  googleCalls: { productId: string; token: string }[];
  /** 지급 결과 — 없으면 정상 지급(granted) */
  grant: GrantResult | null;
  grantCalls: GrantInput[];
  logs: LoggedEntry[];
};

function fresh(): State {
  return {
    sessionUserId: USER_ID,
    apple: null,
    appleCalls: [],
    google: null,
    googleCalls: [],
    grant: null,
    grantCalls: [],
    logs: [],
  };
}

export const state: State = fresh();

export function reset(): void {
  Object.assign(state, fresh());
}

function settle<T>(v: T | Error): T {
  if (v instanceof Error) throw v;
  return v;
}

// ── @/lib/session ──
export async function getSession() {
  const userId = state.sessionUserId;
  return { userId, anonymousId: null, isAuthenticated: !!userId };
}

// ── @/lib/payment/iap/apple ──
export async function verifyAppleTransaction(transactionId: string): Promise<VerifiedPurchase | null> {
  state.appleCalls.push(transactionId);
  return settle(state.apple);
}

// ── @/lib/payment/iap/google ──
export async function verifyGooglePurchase(productId: string, token: string): Promise<VerifiedPurchase | null> {
  state.googleCalls.push({ productId, token });
  return settle(state.google);
}

// ── @/lib/payment/grant ──
export async function grantStarPackage(input: GrantInput): Promise<GrantResult> {
  state.grantCalls.push(input);
  return state.grant ?? { kind: "granted", paymentId: "pay-1", stars: input.pkg.stars, bonusStars: 2, balance: 27 };
}

// ── @/lib/logger ──
function record(level: LoggedEntry["level"], message: string, ctx: LogCtx = {}): void {
  state.logs.push({ level, message, route: ctx.route, extra: ctx.extra ?? {} });
}
export async function logError(err: unknown, ctx?: LogCtx): Promise<void> {
  record("error", err instanceof Error ? err.message : String(err), ctx);
}
export async function logWarn(message: string, ctx?: LogCtx): Promise<void> {
  record("warn", message, ctx);
}
export async function logInfo(message: string, ctx?: LogCtx): Promise<void> {
  record("info", message, ctx);
}
export function ctxFromRequest(_req: Request, base: LogCtx = {}): LogCtx {
  return base;
}
