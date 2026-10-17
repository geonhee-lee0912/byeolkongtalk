// 서버 호출 — /api/auth/app/*. 앱 쪽 호출은 쿠키에 기대지 않는다(iOS 는 웹뷰와 저장소가 따로고 안드로이드는 공유될 수 있다 — 인증은 Bearer). 10초 넘게 응답이 없으면 끊는다
// (첫 화면이 스플래시에 갇히지 않게 — 실패면 session.ts 가 웹뷰 쿠키에 맡기고 연다). 스펙 2026-10-12-앱-1 §7-3·§7-4.
import { Platform } from "react-native";
import { config } from "../config";
import type { AuthApi, Tokens } from "./session.ts";

const TIMEOUT_MS = 10_000;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

/** 서버가 토큰을 거절했다(무효·재사용·회원 없음) — 기기 토큰을 지울 신호. 우리 갱신 라우트의 401 코드만 본다 —
 *  우리 서버가 아닌 401(개발용 빌드의 Vercel 접근 보호 등 — 본문이 JSON 이 아니라 http_401)로 토큰을 지우지 않게 */
export const isAuthError = (e: unknown) =>
  e instanceof ApiError && e.status === 401 && (e.code === "invalid" || e.code === "reused");

async function post(path: string, body: Record<string, unknown>, accessToken?: string): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  // 개발용 빌드만 — dev 사이트 Vercel 접근 보호 통과
  if (config.vercelBypass) headers["x-vercel-protection-bypass"] = config.vercelBypass;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${config.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new ApiError(res.status, typeof data.error === "string" ? data.error : `http_${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function tokensFrom(d: Record<string, unknown>): Tokens {
  if (typeof d.accessToken !== "string" || typeof d.refreshToken !== "string" || typeof d.accessExpiresIn !== "number") {
    throw new ApiError(500, "bad_response");
  }
  // 만료는 기기 시계로 다시 잰다 — 서버의 절대 시각을 기기 시계와 비교하면, 기기 시계가 틀릴 때 매번 갱신하거나 만료된 토큰을 보낸다
  return { accessToken: d.accessToken, refreshToken: d.refreshToken, accessExpiresAt: Date.now() + d.accessExpiresIn * 1000 };
}

export const authApi: AuthApi = {
  async login(payload) {
    const { provider, ...rest } = payload;
    const d = await post(`/api/auth/app/${provider}`, { ...rest, platform: Platform.OS });
    if (typeof d.handoffCode !== "string") throw new ApiError(500, "bad_response");
    return { ...tokensFrom(d), handoffCode: d.handoffCode, isNewUser: d.isNewUser === true };
  },
  async refresh(refreshToken) {
    return tokensFrom(await post("/api/auth/app/refresh", { refreshToken }));
  },
  async handoffCode(accessToken) {
    const d = await post("/api/auth/app/handoff-code", {}, accessToken);
    if (typeof d.handoffCode !== "string") throw new ApiError(500, "bad_response");
    return d.handoffCode;
  },
  async logout(refreshToken) {
    await post("/api/auth/app/logout", { refreshToken });
  },
};
