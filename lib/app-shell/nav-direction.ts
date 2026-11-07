// 앱 화면 전환의 방향 — <html data-nav> 에 넣을 값을 정한다(components/layout/AppNavDirection.tsx 가 넣고, app/globals.css 가 그 값으로 움직임을 고른다).
// 값이 없으면 애니메이션이 없다 — 화면 이동이 아닌 React 트랜지션(페이지 안 useTransition·Suspense)이 미끄러지지 않게. 스펙 2026-11-07-앱-화면 §6.

export type NavKind = "forward" | "back" | "tab" | "none";

export type ClickInfo = {
  sameOrigin: boolean;
  target: string | null;
  download: boolean;
  /** ctrl·meta·shift·alt 또는 가운데 버튼 */
  modified: boolean;
  /** 링크의 data-nav 값(하단 탭은 "tab") */
  navAttr: string | null;
  /** 지금과 같은 경로·쿼리 — 이동이 아니다 */
  samePath: boolean;
};

/** 링크 클릭이 화면 이동이면 그 방향, 아니면 null */
export function navKindForClick(a: ClickInfo): NavKind | null {
  if (!a.sameOrigin || a.download || a.modified || a.samePath) return null;
  if (a.target && a.target !== "_self") return null;
  return a.navAttr === "tab" ? "tab" : "forward";
}

/** 기록 뒤로(popstate). 아이폰 왼쪽 끝 밀기는 웹뷰가 손가락을 따라 이미 움직이니 겹치지 않게 none */
export function navKindForPopstate(platform: "ios" | "android", fromBackButton: boolean): NavKind {
  return platform === "ios" && !fromBackButton ? "none" : "back";
}

let backButton = false;

/** 앱 헤더 '‹' 가 뒤로 가기 직전에 부른다 — 다음 popstate 한 번만 '‹ 로 간 뒤로'로 본다 */
export function markBackButton(): void {
  backButton = true;
}

export function takeBackButton(): boolean {
  const v = backButton;
  backButton = false;
  return v;
}
