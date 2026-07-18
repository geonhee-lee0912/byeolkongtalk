// lib/relationship/passDisplay.ts — 패스 남은시간 표시 포맷 (순수 함수, 단위 테스트 대상)

/**
 * 헤더 pill 의 남은시간 문자열.
 * @param expiresMs 만료 시각 (epoch ms)
 * @param planDays  보유 패스권의 일수 (총시간 = planDays*24)
 * @param nowMs     현재 시각 (epoch ms)
 */
export function formatPassRemaining(
  expiresMs: number,
  planDays: number,
  nowMs: number
): string {
  const remainMs = expiresMs - nowMs;
  if (remainMs <= 0) return "만료";
  const totalHours = planDays * 24;
  const remainMin = remainMs / 60_000;
  if (remainMin < 60) {
    const bucket = Math.min(50, Math.ceil(remainMin / 10) * 10);
    return `${bucket}분/${totalHours}시간`;
  }
  const remainHours = Math.floor(remainMin / 60);
  if (remainHours > totalHours) return `${remainHours}시간 남음`;
  return `${remainHours}/${totalHours}시간`;
}
