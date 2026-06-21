// lib/admin-time.ts — 어드민 대시보드 날짜 경계 (KST 기준).
// 서버(Vercel)는 UTC 로 돌기 때문에 "오늘"을 KST(UTC+9) 자정 기준으로 계산한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 기준 오늘 0시를 UTC ISO 로 반환. */
export function startOfTodayKstIso(): string {
  const shifted = new Date(Date.now() + KST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - KST_OFFSET_MS).toISOString();
}

/** KST 기준 n일 전 0시를 UTC ISO 로 반환 (오늘 포함 7일이면 daysAgoKstIso(6)). */
export function daysAgoKstIso(days: number): string {
  const shifted = new Date(Date.now() + KST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  shifted.setUTCDate(shifted.getUTCDate() - days);
  return new Date(shifted.getTime() - KST_OFFSET_MS).toISOString();
}
