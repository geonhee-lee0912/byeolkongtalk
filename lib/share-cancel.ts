/** 기기 공유창(navigator.share)을 사용자가 닫은 것인가 — 다른 실패(미지원·막힘)만 링크 복사로 넘어간다 */
export function isShareCancel(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === "AbortError";
}
