// lib/acquisition.ts — first-touch 유입 출처 캡처 유틸 (순수).
export const ACQ_COOKIE = "byeolkong_acq";

/** 캡처 대상 파라미터(모두 optional). */
export const ACQ_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
] as const;

export type AcqPayload = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  fbc?: string;
  landing_variant?: string;
  referrer?: string;
  first_seen_at?: string;
  /** 쿠키를 쓴 주체. 없으면(2026-10-10 이전 쿠키) client 로 본다. */
  capture?: "client" | "server";
};

/**
 * fbclid 는 Meta 클릭 ID — 한 글자라도 잘리면 CAPI fbc 로 못 쓴다(Meta: "do not apply any modifications").
 * `_aem_` 접미가 붙은 값은 ~212자까지 나와, 예전 공통 상한 200자가 저장된 fbclid 2,356개 중 1,689개(72%)를
 * 잘랐다(2026-10-04 prod 실측). 그래서 fbclid 만 상한을 따로 둔다 — 저장 폭주 방지용일 뿐이다.
 */
export const FBCLID_MAX_LEN = 500;
/** 2026-10-04 이전 공통 상한. 이 길이로 저장된 fbclid 는 잘린 값으로 본다(실측: 1,689개 전부 `_aem_` 꼬리가 짧다). */
const LEGACY_FBCLID_CAP = 200;

const cap = (k: string, v: string) => v.slice(0, k === "fbclid" ? FBCLID_MAX_LEN : 200);

/** URL 파라미터 맵에서 페이로드 구성. 캡처 키가 하나도 없으면 null. */
export function buildAcqPayload(
  params: Record<string, string | undefined>
): AcqPayload | null {
  const out: AcqPayload = {};
  let has = false;
  for (const k of ACQ_KEYS) {
    const v = params[k];
    if (v) {
      out[k] = cap(k, v);
      has = true;
    }
  }
  return has ? out : null;
}

/** 브라우저 `_fbc` 쿠키 수명 — 서버에서 만든 fbc 도 이 이상 묵은 클릭은 보내지 않는다. */
const FBC_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * user_acquisition 행 → Meta CAPI `fbc`(없으면 null). 요청에 `_fbc` 쿠키가 없을 때의 대체 원천.
 * 랜딩 때 잡은 `_fbc` 가 있으면 그 값, 없으면 Meta 문서의 서버 생성 형식 `fb.1.<최초 관측 ms>.<fbclid 원문>`.
 * 최초 관측 = first_seen_at(클라 시계)이되 가입 시각(서버)보다 늦으면 가입 시각 — 미래 시각을 보내지 않는다.
 */
export function fbcFromAcquisition(
  row: { fbc: string | null; fbclid: string | null; first_seen_at: string | null; created_at: string },
  now: Date
): string | null {
  const signedUp = Date.parse(row.created_at);
  const firstSeen = row.first_seen_at ? Date.parse(row.first_seen_at) : NaN;
  const observedAt = Number.isFinite(firstSeen) ? Math.min(firstSeen, signedUp) : signedUp;
  if (now.getTime() - observedAt > FBC_TTL_MS) return null;
  if (row.fbc) return row.fbc;
  const id = row.fbclid;
  if (!id || id.length === LEGACY_FBCLID_CAP || id.length >= FBCLID_MAX_LEN) return null;
  return `fb.1.${observedAt}.${id}`;
}

/** 쿠키 raw(encodeURIComponent(JSON)) → AcqPayload | null (방어적). */
export function parseAcqCookie(raw: string | undefined): AcqPayload | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (!obj || typeof obj !== "object") return null;
    return obj as AcqPayload;
  } catch {
    return null;
  }
}

const OWN_HOSTS = new Set(["byeolkongtalk.com", "www.byeolkongtalk.com", "dev.byeolkongtalk.com", "localhost"]);

/**
 * proxy.ts 용 — 서버가 심는 first-touch 쿠키 값(encodeURIComponent(JSON)). 클라(AuthBootstrap)와 같은 페이로드 모양.
 * 캡처 키가 하나도 없으면 null. Referer 가 우리 도메인이면 referrer 는 넣지 않는다.
 * 주의: NextResponse.cookies.set 은 값을 스스로 encodeURIComponent 한다(@edge-runtime/cookies stringifyCookie) —
 * 이 반환값을 그대로 넘기면 이중 인코딩이라 parseAcqCookie 가 못 읽는다. 넘길 땐 decodeURIComponent 한 JSON 을.
 */
export function buildServerAcqCookie(
  params: URLSearchParams,
  referer: string | null,
  fbcCookie: string | undefined,
  nowIso: string
): string | null {
  const map: Record<string, string | undefined> = {};
  for (const k of ACQ_KEYS) map[k] = params.get(k) ?? undefined;
  const payload = buildAcqPayload(map);
  if (!payload) return null;
  payload.first_seen_at = nowIso;
  const lv = params.get("v");
  if (lv) payload.landing_variant = lv.slice(0, 200);
  if (referer) {
    try {
      if (!OWN_HOSTS.has(new URL(referer).hostname)) payload.referrer = referer.slice(0, 200);
    } catch {}
  }
  if (fbcCookie) payload.fbc = fbcCookie;
  payload.capture = "server";
  return encodeURIComponent(JSON.stringify(payload));
}

export type PageViewAcqRow = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  landing_variant: string | null;
  referrer: string | null;
  created_at: string;
};

/** 가입 시 쿠키가 없을 때 — page_views 최초 유입 행 → AcqPayload (fbclid/fbc 는 page_views 에 없다). */
export function acqFromPageView(row: PageViewAcqRow): AcqPayload {
  const out: AcqPayload = { first_seen_at: row.created_at };
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const) {
    const v = row[k];
    if (v) out[k] = v.slice(0, 200);
  }
  if (row.landing_variant) out.landing_variant = row.landing_variant.slice(0, 200);
  if (row.referrer) out.referrer = row.referrer.slice(0, 200);
  return out;
}
