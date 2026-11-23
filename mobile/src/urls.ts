// 웹뷰 주소 만들기·검사 — RN 의 URL 구현은 불완전해서(searchParams·정규화) 정규식·문자열로 한다. 순수 함수(테스트 urls.test.ts).
// 루트 node --test 가 이 파일을 돌린다 — react-native import 금지(웹↔앱 공용 약속 lib/app-bridge/protocol.ts 만 가져온다).
import { HANDOFF_CODE_HEADER } from "../../lib/app-bridge/protocol.ts";

export type HandoffMode = "launch" | "login";

/** 웹뷰가 여는 것 — react-native-webview 의 source 모양. headers 는 앱이 연 그 첫 요청에만 실리고 웹뷰 안 이동(링크·폼)엔 안 실린다.
 *  리다이렉트를 따라가는지는 플랫폼마다 다를 수 있다[추정 — Task 28 실기기 확인] — 그래서 헤더가 꼭 닿아야 하는 요청(handoff) 앞엔 리다이렉트를 두지 않는다 */
export type WebSource = { uri: string; headers?: Record<string, string> };

/** "scheme://host/rest" 로 쪼갠다(scheme·host 는 소문자). 모양이 아니면 null */
export function splitUrl(url: string): { scheme: string; host: string; rest: string } | null {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)(.*)$/i.exec(url);
  return m ? { scheme: m[1].toLowerCase(), host: m[2].toLowerCase(), rest: m[3] } : null;
}

/** 우리 사이트(기준 주소와 같은 scheme·host, 또는 www.)의 주소인가 */
export function isOurUrl(url: string, base: string): boolean {
  const u = splitUrl(url);
  const b = splitUrl(base);
  if (!u || !b) return false;
  return u.scheme === b.scheme && (u.host === b.host || u.host === `www.${b.host}`);
}

/** rest(경로·쿼리·해시)에서 경로만 */
export function pathOf(rest: string): string {
  return rest.split(/[?#]/)[0] || "/";
}

/** 쿼리 값 하나 — 없거나 디코딩이 깨지면 null(해시 뒤는 보지 않는다). 쿼리는 첫 ? 뒤 전부다(URLSearchParams 와 같다 — 값 속 ? 에서 자르지 않는다) */
export function queryParam(rest: string, name: string): string | null {
  const head = rest.split("#")[0];
  const qAt = head.indexOf("?");
  const q = qAt >= 0 ? head.slice(qAt + 1) : "";
  if (!q) return null;
  for (const part of q.split("&")) {
    const eq = part.indexOf("=");
    if ((eq >= 0 ? part.slice(0, eq) : part) !== name) continue;
    try {
      return decodeURIComponent((eq >= 0 ? part.slice(eq + 1) : "").replace(/\+/g, " "));
    } catch {
      return null;
    }
  }
  return null;
}

/** 앱이 웹뷰로 보낼 내부 경로 검사 — 웹 safeNextPath 와 같은 뜻(내부 경로만). 서버 handoff 가 safeNextPath 로 다시 거른다.
 *  단 500자 상한은 앱에만 있다 — 더 긴 next(광고 랜딩 /start + fbclid 등)는 앱에서만 "/" 로 접힌다(앱에서 /start 를 볼 일이 드물다 — 접혀도 로그인은 되고 홈으로 갈 뿐, /start 의 가입 팝업·고른 메뉴 이어가기를 잃는다) */
export function safeAppPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 500) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  // 백슬래시·공백·제어문자는 브라우저가 정규화하며 바깥 주소로 바뀔 수 있다 — 아예 거절
  if (/[\\\s\u0000-\u001f\u007f]/.test(raw)) return null;
  // 경로의 . / .. 조각 거절(쿼리 값의 점은 괜찮다). 퍼센트 인코딩 점(%2e)도 URL 파서가 점 조각으로 푼다 — /%2e%2e//x 는 //x 가 된다
  if (/(^|\/)(\.|%2e){1,2}(\/|$)/i.test(pathOf(raw))) return null;
  return raw;
}

/** 웹뷰 쿠키 발급 요청. 🔴 교환 코드는 주소가 아니라 헤더(HANDOFF_CODE_HEADER)로 싣는다 — 서버는 주소의 code 를 보지 않는다.
 *  주소에 실으면 딥링크·next·링크로 남의 코드를 앱 웹뷰에 먹일 수 있고, 그 요청도 앱 UA 라 서버 관문을 통과한다(앱 안 login CSRF).
 *  vercelBypass(개발용 빌드만): Vercel 은 우회 쿠키를 '리다이렉트 + Set-Cookie' 로 심는다(Vercel 문서 — x-vercel-set-bypass-cookie).
 *  그 리다이렉트가 handoff 앞에 끼면 코드 헤더가 떨어질 수 있어서, handoff 요청엔 우회 값을 헤더로만 달고(쿠키 심기 없음 → 리다이렉트 없음)
 *  우회 쿠키는 handoff 다음 이동(next)에서 심는다 */
export function handoffSource(base: string, code: string, next: string, mode: HandoffMode, vercelBypass?: string | null): WebSource {
  const headers: Record<string, string> = { [HANDOFF_CODE_HEADER]: code };
  if (vercelBypass) headers["x-vercel-protection-bypass"] = vercelBypass;
  return {
    uri: `${base}/api/auth/app/handoff?next=${encodeURIComponent(withVercelBypass(next, vercelBypass))}&mode=${mode}`,
    headers,
  };
}

export function resetUrl(base: string, next: string): string {
  return `${base}/api/auth/app/reset?next=${encodeURIComponent(next)}`;
}

/** 개발용 빌드만 — dev 사이트의 Vercel 접근 보호를 우회 쿠키로 통과한다(값은 EAS env · 커밋 금지) */
export function withVercelBypass(url: string, secret: string | null | undefined): string {
  if (!secret) return url;
  const hashAt = url.indexOf("#");
  const head = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const tail = hashAt >= 0 ? url.slice(hashAt) : "";
  const sep = head.includes("?") ? "&" : "?";
  return `${head}${sep}x-vercel-protection-bypass=${encodeURIComponent(secret)}&x-vercel-set-bypass-cookie=true${tail}`;
}
