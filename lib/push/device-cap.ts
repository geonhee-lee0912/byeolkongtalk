// 회원별 기기 상한 — 순수(테스트 device-cap.test.ts). 등록(store.trimUserDevices)과 발송(dispatch deliver)이 같이 쓴다.

/** 회원 한 명이 켜 둘 수 있는 기기 수 — 넘으면 가장 오래 안 본 기기부터 끈다. 가짜 토큰을 무한히 등록해
 *  cron 발송 시간을 다 잡아먹는 것을 막는다(Codex 보안 리뷰 #34·#35). 실제로 한 사람이 쓰는 폰·태블릿 수보다 넉넉하게 */
export const MAX_ACTIVE_DEVICES_PER_USER = 5;

/** 켜진 기기 목록 → 끌 토큰(최근 확인 순으로 max 개를 남긴다). 같은 시각이면 토큰 순으로 끊어 결과가 늘 같다 */
export function devicesOverCap(rows: { token: string; lastSeenAt: string }[], max = MAX_ACTIVE_DEVICES_PER_USER): string[] {
  return [...rows]
    .sort((a, b) => (a.lastSeenAt === b.lastSeenAt ? a.token.localeCompare(b.token) : a.lastSeenAt < b.lastSeenAt ? 1 : -1))
    .slice(max)
    .map((r) => r.token);
}
