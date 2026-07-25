// 페이지뷰 비콘 순수 로직. /api/pv 에서 사용.
// 봇 트래픽이 UV/PV 를 오염시키면 퍼널 전환율이 전부 낮게 나오므로 입구에서 막는다.

const BOT_UA =
  /bot|crawler|spider|crawling|facebookexternalhit|slurp|bingpreview|curl|wget|python-requests|okhttp|headlesschrome|lighthouse|pingdom|monitor|preview/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return true; // UA 없음 = 정상 브라우저 아님
  return BOT_UA.test(ua);
}

const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 라우트 단위 집계를 위해 동적 세그먼트를 :id 로 접는다. 실패 시 null. */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  const clean = raw.split("?")[0].split("#")[0];
  const folded = clean
    .split("/")
    .map((s) => (UUIDISH.test(s) || /^\d{6,}$/.test(s) ? ":id" : s))
    .join("/");
  return (folded || "/").slice(0, 200);
}
