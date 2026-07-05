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
};

const cap = (v: string) => v.slice(0, 200);

/** URL 파라미터 맵에서 페이로드 구성. 캡처 키가 하나도 없으면 null. */
export function buildAcqPayload(
  params: Record<string, string | undefined>
): AcqPayload | null {
  const out: AcqPayload = {};
  let has = false;
  for (const k of ACQ_KEYS) {
    const v = params[k];
    if (v) {
      out[k] = cap(v);
      has = true;
    }
  }
  return has ? out : null;
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
