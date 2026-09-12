// 페이지뷰 비콘 순수 로직. /api/pv 에서 사용.
// 봇 트래픽이 UV/PV 에 섞이면 퍼널 전환율이 전부 낮게 나온다. 다만 여기서 요청을 막지는 않는다 —
// /api/pv 가 is_bot 플래그로 표시해 그대로 저장하고, 실제 제외는 분석 쿼리에서 한다.

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
  const segs = clean.split("/");
  // byeoljari 공유 랜딩 /fortune/byeoljari/{shareId} → :shareId.
  // shareId 는 base62 10자라 아래 UUID/숫자 규칙에 안 걸린다(전용 규칙 필요).
  // 개별 맵 귀속은 user_acquisition.utm_content 가 담당 — page_views 는 라우트 트래픽용.
  if (segs[1] === "fortune" && segs[2] === "byeoljari" && segs[3]) {
    segs[3] = ":shareId";
  }
  const folded = segs
    .map((s) => (UUIDISH.test(s) || /^\d{6,}$/.test(s) ? ":id" : s))
    .join("/");
  return (folded || "/").slice(0, 200);
}

// 브라우저 환경 판별. 광고 유입의 99.6% 가 인앱 브라우저(Meta '앱 내')인데 로그인 게이트에서 30.8% 가
// 이탈한다 — 인앱의 카카오 OAuth 마찰이 원인인지 판별하려면 앱별로 남겨야 한다.
// ⚠️ inapp 을 하나로 뭉치면 안 된다: 카카오톡 인앱은 카카오 로그인이 네이티브로 붙는 최선 케이스,
//    인스타 인앱이 최악. 합치면 비교군이 사라져 판별 자체가 불가능해진다.
// 판별 순서 고정: 앱 전용 토큰 → Android WebView(; wv). 인스타/페북 Android UA 에도 wv 가 있어
// 순서를 바꾸면 전부 other_inapp 으로 접힌다.
export type BrowserEnv = "ig" | "fb" | "kakao" | "other_inapp" | "browser";

export function detectBrowserEnv(
  ua: string | null | undefined,
): BrowserEnv | null {
  if (!ua) return null; // 추측하지 않는다 — 모르면 null
  if (/instagram|barcelona/i.test(ua)) return "ig"; // Barcelona = Threads
  if (/fban|fbav|fb_iab/i.test(ua)) return "fb";
  if (/kakaotalk/i.test(ua)) return "kakao";
  if (/naver\(inapp|daumapps|; wv\)/i.test(ua)) return "other_inapp";
  return "browser";
}
