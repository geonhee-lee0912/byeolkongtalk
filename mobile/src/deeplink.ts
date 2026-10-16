// 앱 주소 체계 `<scheme>://open?path=<내부 경로>` → 웹뷰가 열 경로(③의 알림 클릭이 쓴다). 스펙 2026-10-12-앱-1 §4. 순수 함수.
import { queryParam, safeAppPath } from "./urls.ts";

export function pathFromDeepLink(url: string | null | undefined, scheme: string): string | null {
  if (!url) return null;
  const prefix = `${scheme.toLowerCase()}://open`;
  if (!url.toLowerCase().startsWith(prefix)) return null;
  const rest = url.slice(prefix.length);
  // open 뒤엔 쿼리(또는 /?쿼리)만 — openx 같은 다른 호스트를 잘못 받지 않게
  if (rest !== "" && rest !== "/" && !rest.startsWith("?") && !rest.startsWith("/?")) return null;
  return safeAppPath(queryParam(rest.replace(/^\//, ""), "path"));
}
