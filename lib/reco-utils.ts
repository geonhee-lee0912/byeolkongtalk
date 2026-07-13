// lib/reco-utils.ts — 순수 문자열 유틸 (클라이언트 번들 안전, Anthropic SDK 미포함)
// lib/reco.ts 에서 re-export 됨. 클라이언트 컴포넌트에서는 이 파일을 직접 import.

export type RecoProduct =
  | "saju:good_days"
  | "saju:nature"
  | "saju:choice"
  | "tarot:relationship_5"
  | "continue";

export const RECO_PRODUCTS: RecoProduct[] = [
  "saju:good_days",
  "saju:nature",
  "saju:choice",
  "tarot:relationship_5",
  "continue",
];

/** 응답 본문 내 [RECO:...] 마커 — 표시 전 반드시 strip. */
export const RECO_MARKER_REGEX = /\[RECO:([a-z0-9_:]+)\]/gi;

export function stripRecoMarkers(text: string): string {
  return text.replace(RECO_MARKER_REGEX, "").replace(/\n{3,}/g, "\n\n");
}

/** 첫 유효 마커의 product 반환 (enum 밖 값은 무시). */
export function parseRecoMarker(text: string): RecoProduct | null {
  for (const m of text.matchAll(RECO_MARKER_REGEX)) {
    const v = m[1].toLowerCase();
    if ((RECO_PRODUCTS as string[]).includes(v)) return v as RecoProduct;
  }
  return null;
}
