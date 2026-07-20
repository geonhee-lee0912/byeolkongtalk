// lib/analytics/creative-alias.ts — 잘못 박힌 utm_content 를 정식 소재 키로 교정 병합.
// Meta {{ad.name}} 매크로는 광고 저장 시점 이름으로 URL 에 박제됨 — 복제 기본 이름인 채
// 게재된 기간의 유입은 영구히 그 이름으로 남으므로, 표시 단계에서 alias 로 병합한다.
export const CREATIVE_ALIASES: Record<string, string> = {
  // 2026-07-17~20 byeolkong_2026-07_launch 캠페인의 tarot 광고가 복제 기본 이름인 채
  // 게재된 기간 유입 (소재 동일 — 2026-07-20 URL 파라미터 정리로 이후 유입은 tarot 로 찍힘)
  "새 판매 광고 - 사본": "tarot",
};

export function canonicalCreative<T extends string | null>(utmContent: T): T {
  return (utmContent && CREATIVE_ALIASES[utmContent]) ? (CREATIVE_ALIASES[utmContent] as T) : utmContent;
}
