// 카카오 콜백 실패 리다이렉트 목적지 — 순수 함수. 스펙 2026-10-11-타로-로그인전-맛보기 §5-4
// 뽑기 이어가기(/tarot/draw…)로 가던 로그인만 그 화면으로 돌려보내 "다시 눌러줘"를 띄운다(뽑은 카드는 localStorage 에 남아 있다).
// 그 밖(옛 흐름 포함)은 지금처럼 홈 — 입구 반반의 대조군을 바꾸지 않는다.
// next 는 호출부가 이미 safeNextPath 로 거른 내부 경로다(open redirect 방지는 거기서).
export function loginFailRedirectUrl(next: string, reason: string, baseUrl: string): URL {
  const back = next === "/tarot/draw" || next.startsWith("/tarot/draw?");
  const u = new URL(back ? next : "/", baseUrl);
  u.searchParams.set("login", "fail");
  u.searchParams.set("reason", reason);
  return u;
}
