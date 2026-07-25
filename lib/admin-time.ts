// lib/admin-time.ts — 어드민 대시보드 날짜 경계 (KST 기준).
// 서버(Vercel)는 UTC 로 돌기 때문에 "오늘"을 KST(UTC+9) 자정 기준으로 계산한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 기준 오늘 0시를 UTC ISO 로 반환. */
export function startOfTodayKstIso(): string {
  const shifted = new Date(Date.now() + KST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - KST_OFFSET_MS).toISOString();
}

// '오늘' 을 자정이 아니라 오전 10시에 롤오버하는 기준.
// 밤사이~새벽 유입이 많아 자정 기준이면 한 밤의 세션이 두 날짜로 쪼개져 "짤려" 보인다.
//
// 어느 화면이 어떤 기준을 쓰는가 (섞지 말 것):
// - 오전 10시 롤오버 — /admin 대시보드 KPI, /admin/traffic (UV/PV 추세 + 오늘 카드).
//   트래픽은 "밤사이 한 세션이 어느 라우트에서 끊겼나" 를 보는 화면이라 세션을 쪼개면 안 된다.
// - KST 자정 — /admin/analytics 트렌드(lib/analytics/aggregate.ts 의 kstDate),
//   연애 패스 일일 턴 카운트(lib/relationship/passes.ts).
export const ADMIN_TODAY_CUTOFF_HOUR = 10;

/** KST 기준 '오늘' 시작을 오전 10시 롤오버로 반환. 10시 전이면 어제 10시. */
export function startOfAdminTodayKstIso(): string {
  const shifted = new Date(Date.now() + KST_OFFSET_MS);
  const beforeCutoff = shifted.getUTCHours() < ADMIN_TODAY_CUTOFF_HOUR;
  shifted.setUTCHours(ADMIN_TODAY_CUTOFF_HOUR, 0, 0, 0);
  if (beforeCutoff) shifted.setUTCDate(shifted.getUTCDate() - 1);
  return new Date(shifted.getTime() - KST_OFFSET_MS).toISOString();
}

/**
 * UTC ISO → 오전 10시 롤오버 기준 날짜(YYYY-MM-DD). 날짜 버킷용 순수 함수.
 * KST 로 옮긴 뒤 컷오프 시간만큼 더 빼면 롤오버가 된다 —
 * 09:59 KST 는 전날, 10:00 KST 는 당일 (자정 직후 00:30 KST 도 전날에 귀속).
 */
export function adminKstDate(iso: string): string {
  const shifted = new Date(iso).getTime() + KST_OFFSET_MS - ADMIN_TODAY_CUTOFF_HOUR * 3600000;
  return new Date(shifted).toISOString().slice(0, 10);
}

/**
 * 오전 10시 롤오버 기준 n일 전 시작(= n일 전 오전 10시 KST)을 UTC ISO 로 반환.
 * 오늘 포함 30일이면 adminDaysAgoKstIso(29). KST 는 DST 가 없어 하루 = 정확히 86400초.
 */
export function adminDaysAgoKstIso(days: number): string {
  return new Date(Date.parse(startOfAdminTodayKstIso()) - days * 86400000).toISOString();
}

/** KST 기준 n일 전 0시를 UTC ISO 로 반환 (오늘 포함 7일이면 daysAgoKstIso(6)). */
export function daysAgoKstIso(days: number): string {
  const shifted = new Date(Date.now() + KST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  shifted.setUTCDate(shifted.getUTCDate() - days);
  return new Date(shifted.getTime() - KST_OFFSET_MS).toISOString();
}
