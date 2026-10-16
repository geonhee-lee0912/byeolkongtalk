// 웹뷰 이동 규칙 — 스펙 2026-10-12-앱-1 §4. 순수 함수(테스트 linkRules.test.ts). react-native import 금지.
// 1) 우리 로그인 시작 주소 → 네이티브 로그인  2) 그 밖의 우리 주소 → 웹뷰  3) 다른 http(s) → 앱 안 브라우저
// 4) 앱 호출 주소(kakaolink: · intent: · tel: …) → OS. 로그아웃은 주소가 아니라 웹 메시지(auth.loggedOut)로 받는다.
import { isOurUrl, pathOf, queryParam, safeAppPath, splitUrl } from "./urls.ts";

export type NavDecision =
  | { kind: "allow" }
  | { kind: "login"; provider: "kakao" | "apple"; next: string }
  | { kind: "browser" }
  | { kind: "os" }
  | { kind: "block" };

const LOGIN_PATHS: Record<string, "kakao" | "apple"> = {
  "/api/auth/login/kakao": "kakao",
  "/api/auth/login/apple": "apple",
};

/** 웹뷰 안에서 그대로 두는 엔진 내부 주소 */
const INTERNAL_SCHEMES = new Set(["about", "blob", "data", "javascript"]);

export function decideNavigation(url: string, base: string, opts: { isTopFrame?: boolean } = {}): NavDecision {
  // iframe(메타 픽셀·결제 위젯 등)의 이동은 건드리지 않는다 — 메인 화면 이동만 규칙을 탄다
  if (opts.isTopFrame === false) return { kind: "allow" };
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  if (!scheme) return { kind: "block" };
  if (scheme === "http" || scheme === "https") {
    if (!isOurUrl(url, base)) return { kind: "browser" };
    const rest = splitUrl(url)?.rest ?? "";
    const provider = LOGIN_PATHS[pathOf(rest)];
    if (provider) return { kind: "login", provider, next: safeAppPath(queryParam(rest, "next")) ?? "/" };
    return { kind: "allow" };
  }
  if (INTERNAL_SCHEMES.has(scheme)) return { kind: "allow" };
  if (scheme === "file") return { kind: "block" };
  return { kind: "os" };
}

/** 안드로이드 intent: 주소 → 열어 볼 주소 후보(RN Linking 은 intent: 를 직접 못 연다 — 카카오톡 공유가 이걸 쓴다).
 *  primary = scheme 주소, fallback = S.browser_fallback_url → 없으면 마켓 */
export function parseIntentUrl(url: string): { primary: string | null; fallback: string | null } | null {
  if (!/^intent:/i.test(url)) return null;
  const marker = url.indexOf("#Intent;");
  if (marker < 0) return { primary: null, fallback: null };
  const body = url.slice("intent:".length, marker);
  let scheme: string | null = null;
  let pkg: string | null = null;
  let fallback: string | null = null;
  for (const part of url.slice(marker + "#Intent;".length).split(";")) {
    if (part.startsWith("scheme=")) scheme = part.slice("scheme=".length);
    else if (part.startsWith("package=")) pkg = part.slice("package=".length);
    else if (part.startsWith("S.browser_fallback_url=")) {
      try {
        fallback = decodeURIComponent(part.slice("S.browser_fallback_url=".length));
      } catch {
        fallback = null;
      }
    }
  }
  return {
    primary: scheme ? `${scheme}:${body}` : null,
    fallback: fallback ?? (pkg ? `market://details?id=${pkg}` : null),
  };
}
