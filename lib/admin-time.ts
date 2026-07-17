// lib/admin-time.ts — 어드민 대시보드 날짜 경계 (KST 기준).
// 서버(Vercel)는 UTC 로 돌기 때문에 "오늘"을 KST(UTC+9) 자정 기준으로 계산한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 기준 오늘 0시를 UTC ISO 로 반환. */
export function startOfTodayKstIso(): string {
  const shifted = new Date(Date.now() + KST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - KST_OFFSET_MS).toISOString();
}

// 대시보드 '오늘' KPI 는 자정이 아니라 오전 10시에 롤오버한다.
// 밤사이~새벽 유입이 많아 자정 기준이면 한 밤의 세션이 두 날짜로 쪼개져 "짤려" 보인다.
// (분석 트렌드의 날짜 버킷은 여전히 자정 기준 startOfTodayKstIso 를 쓴다 — 섞지 말 것)
export const ADMIN_TODAY_CUTOFF_HOUR = 10;

/** KST 기준 '오늘' 시작을 오전 10시 롤오버로 반환. 10시 전이면 어제 10시. */
export function startOfAdminTodayKstIso(): string {
  const shifted = new Date(Date.now() + KST_OFFSET_MS);
  const beforeCutoff = shifted.getUTCHours() < ADMIN_TODAY_CUTOFF_HOUR;
  shifted.setUTCHours(ADMIN_TODAY_CUTOFF_HOUR, 0, 0, 0);
  if (beforeCutoff) shifted.setUTCDate(shifted.getUTCDate() - 1);
  return new Date(shifted.getTime() - KST_OFFSET_MS).toISOString();
}

/** KST 기준 n일 전 0시를 UTC ISO 로 반환 (오늘 포함 7일이면 daysAgoKstIso(6)). */
export function daysAgoKstIso(days: number): string {
  const shifted = new Date(Date.now() + KST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  shifted.setUTCDate(shifted.getUTCDate() - days);
  return new Date(shifted.getTime() - KST_OFFSET_MS).toISOString();
}
