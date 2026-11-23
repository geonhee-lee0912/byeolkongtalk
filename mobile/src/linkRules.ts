// 웹뷰 이동 규칙 — 스펙 2026-10-12-앱-1 §4. 순수 함수(테스트 linkRules.test.ts). react-native import 금지.
// 1) 우리 로그인 시작 주소 → 네이티브 로그인  2) 그 밖의 우리 주소 → 웹뷰  3) 다른 http(s) → 앱 안 브라우저(앱을 여는 유니버설 링크는 OS)
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

/** 웹뷰 안에서 그대로 두는 엔진 내부 주소. data:·남의 blob: 은 막는다 — 최상위로 열리면 주소창 없는 앱 화면에 남이 만든 HTML 이 뜬다
 *  (우리 웹은 data: 로 이동하지 않고, blob: 은 우리 출처 것만 쓴다 — 이미지 저장) */
const INTERNAL_SCHEMES = new Set(["about", "javascript"]);

/** 다른 사이트 주소지만 앱을 여는 유니버설 링크 — 앱 안 브라우저(iOS SFSafariViewController)로 처음 연 주소는 앱을 열지 않고 그 웹 페이지만 띄운다.
 *  OS 에 넘기면(Linking.openURL) 그 앱이 열리고, 앱이 없으면 기본 브라우저가 연다.
 *  카카오 JS SDK 2.7.4 공유는 iOS 에서 카카오톡을 https://talk-apps.kakao.com/scheme/<encodeURIComponent(kakaolink://send…)> 로 연다
 *  (callWeb2appForTalk → web2appViaCustomUrlSchemeForIOS 가 window.top.location.href 로. 안드로이드는 intent:) */
const APP_LINK_HOSTS = new Set(["talk-apps.kakao.com"]);

export function decideNavigation(url: string, base: string, opts: { isTopFrame?: boolean } = {}): NavDecision {
  // iframe(메타 픽셀·결제 위젯 등)의 이동은 건드리지 않는다 — 메인 화면 이동만 규칙을 탄다.
  // isTopFrame 은 iOS 만 준다(react-native-webview 14). 안드로이드는 이 값이 없어 최상위로 본다 — 크로미움이 iframe 의 http(s)·about 이동은
  // 묻지 않고 다른 주소 체계(intent: 등)만 물어서[추정 — Task 28 #12], 안드로이드에선 iframe 의 intent: 도 아래 규칙을 그대로 탄다
  if (opts.isTopFrame === false) return { kind: "allow" };
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  if (!scheme) return { kind: "block" };
  if (scheme === "http" || scheme === "https") {
    if (!isOurUrl(url, base)) return APP_LINK_HOSTS.has(splitUrl(url)?.host ?? "") ? { kind: "os" } : { kind: "browser" };
    const rest = splitUrl(url)?.rest ?? "";
    const provider = LOGIN_PATHS[pathOf(rest)];
    if (provider) return { kind: "login", provider, next: safeAppPath(queryParam(rest, "next")) ?? "/" };
    return { kind: "allow" };
  }
  if (INTERNAL_SCHEMES.has(scheme)) return { kind: "allow" };
  if (scheme === "blob") return isOurUrl(url.slice("blob:".length), base) ? { kind: "allow" } : { kind: "block" };
  if (scheme === "file" || scheme === "data") return { kind: "block" };
  return { kind: "os" };
}

/** 안드로이드 intent: 주소 → 열어 볼 주소 후보(RN Linking 은 intent: 를 직접 못 연다 — 카카오톡 공유가 이걸 쓴다).
 *  primary = scheme 주소, fallback = S.browser_fallback_url(http(s) 만 — 크롬과 같은 규칙) → 없으면 마켓 */
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
        const v = decodeURIComponent(part.slice("S.browser_fallback_url=".length));
        // javascript:·intent:·다른 앱 주소는 버린다 — 대체 주소는 웹 페이지만
        fallback = /^https?:\/\//i.test(v) ? v : null;
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
