// 웹 애플 로그인 순수 조각 — 인증 주소, state 해석, 애플이 주는 이름(user) 해석, 같은 출처로 다시 보내는 자동 제출 폼.
// 흐름: /api/auth/login/apple → 애플 → (form_post · 교차 사이트) /api/auth/apple/callback → (자동 제출 · 같은 출처) /api/auth/apple/complete
// 애플의 form_post 는 교차 사이트 POST 라 SameSite=Lax 쿠키(state·유입 acq·anon·_fbp)가 안 실려 온다.
// callback 은 받은 값을 같은 출처 POST 로 다시 보내기만 하고, 판단은 쿠키가 실려 오는 complete 가 한다. 스펙 2026-10-12-앱-1 §7-5.
import type { AppleName } from "./nickname.ts";

export const APPLE_STATE_COOKIE = "byeolkong_apple_state";
export const APPLE_STATE_TTL_SEC = 5 * 60;
/** callback 이 complete 로 넘기는 필드(애플 form_post 필드 그대로) */
export const APPLE_FORM_FIELDS = ["code", "id_token", "state", "user", "error"] as const;
/** 한 필드 최대 길이 — id_token 은 1~2KB. 이보다 길면 버린다 */
export const APPLE_FIELD_MAX = 10_000;

export function appleRedirectUri(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/auth/apple/callback`;
}

export function appleAuthorizeUrl(p: { servicesId: string; redirectUri: string; state: string; nonce: string }): string {
  // URLSearchParams 는 공백을 '+' 로 쓴다 — 애플 문서 예시대로 %20 이 되게 직접 인코딩한다
  const query: [string, string][] = [
    ["client_id", p.servicesId],
    ["redirect_uri", p.redirectUri],
    ["response_type", "code id_token"],
    ["response_mode", "form_post"],
    ["scope", "name"],
    ["state", p.state],
    ["nonce", p.nonce],
  ];
  return `https://appleid.apple.com/auth/authorize?${query.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}

/** state = "{nonce 32hex}|{next}" — 카카오 로그인과 같은 모양 */
export function parseAppleState(state: string): { nonce: string; next: string } {
  const i = state.indexOf("|");
  return i >= 0 ? { nonce: state.slice(0, i), next: state.slice(i + 1) } : { nonce: state, next: "/" };
}

/** 애플이 첫 로그인 때만 주는 user 필드(JSON) → 이름. 이상하면 null */
export function parseAppleUserName(raw: string | null | undefined): AppleName {
  if (!raw) return null;
  try {
    const name = (JSON.parse(raw) as { name?: { firstName?: unknown; lastName?: unknown } } | null)?.name;
    if (!name) return null;
    return {
      givenName: typeof name.firstName === "string" ? name.firstName : null,
      familyName: typeof name.lastName === "string" ? name.lastName : null,
    };
  } catch {
    return null;
  }
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** 받은 값을 같은 출처 POST 로 다시 보내는 페이지. 값은 전부 이스케이프한다(애플 user 필드엔 사용자 이름이 그대로 들어 있다).
 *  버튼은 스크립트가 못 도는 경우(꺼짐·CSP 차단)의 출구다 — <noscript> 는 CSP 가 스크립트만 막으면 그려지지 않아 빈 화면에 갇힌다.
 *  스크립트가 돌면 버튼을 먼저 숨기고 제출한다(응답을 기다리는 동안 한 번 더 눌러 두 번 보내지 않게) */
export function renderAutoPostForm(action: string, fields: Record<string, string>): string {
  const inputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`)
    .join("");
  return (
    `<!doctype html><html lang="ko"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">` +
    `<title>별콩톡</title></head><body>` +
    `<form method="post" action="${escapeHtml(action)}">${inputs}<button type="submit">계속하기</button></form>` +
    `<script>var f=document.forms[0];f.querySelector("button").hidden=true;f.submit()</script></body></html>`
  );
}
