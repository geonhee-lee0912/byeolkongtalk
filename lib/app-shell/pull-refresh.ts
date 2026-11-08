// 안드로이드 앱의 당겨서 새로고침 거리 판정(순수) — 아이폰은 웹뷰 기본 기능을 앱이 켠다. 스펙 2026-11-07-앱-화면 §5 ④
// 화면 맨 위(scrollY 0)에서 아래로 끈 거리에 저항 0.5 를 준다. 이 거리를 넘겨 놓으면 앱에 새로고침을 청한다

export const PULL_REFRESH_AT = 72;
const PULL_MAX = 120;
const RESISTANCE = 0.5;

/** 손가락 시작 y·지금 y·문서 스크롤 → 표시가 내려올 거리(px). 맨 위가 아니거나 위로 끌면 0 */
export function pullDistance(startY: number, y: number, scrollY: number): number {
  if (scrollY > 0) return 0;
  const dy = y - startY;
  if (dy <= 0) return 0;
  return Math.min(PULL_MAX, dy * RESISTANCE);
}

export function shouldRefresh(distance: number): boolean {
  return distance >= PULL_REFRESH_AT;
}
