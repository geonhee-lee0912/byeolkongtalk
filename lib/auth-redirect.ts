// 카카오 콜백 실패 리다이렉트 목적지 — 순수 함수. 스펙 2026-10-11-타로-로그인전-맛보기 §5-4
// 뽑기 이어가기(/tarot/draw…)로 가던 로그인만 그 화면으로 돌려보내 "다시 눌러줘"를 띄운다(뽑은 카드는 localStorage 에 남아 있다).
// 그 밖(옛 흐름 포함)은 지금처럼 홈 — 입구 반반의 대조군을 바꾸지 않는다.
// next 는 호출부가 이미 safeNextPath 로 거른 내부 경로다(open redirect 방지는 거기서).
// 🔒 그래도 이 함수는 자체로 안전하다(그 거름에 기대지 않는다) — next 가 정확히 `/tarot/draw` 이거나 `/tarot/draw?` 로 시작할 때만 그리로 가고, 나머지는 전부 `/` 다.
// 그 조건을 통과하는 값은 `/t` 로 시작하니 `//evil.example` 같은 프로토콜 상대 주소일 수 없고, URL 도 baseUrl 기준으로 만들어 어느 쪽이든 다른 출처로 못 간다.
export function loginFailRedirectUrl(next: string, reason: string, baseUrl: string): URL {
  const back = next === "/tarot/draw" || next.startsWith("/tarot/draw?");
  const u = new URL(back ? next : "/", baseUrl);
  u.searchParams.set("login", "fail");
  u.searchParams.set("reason", reason);
  return u;
}
