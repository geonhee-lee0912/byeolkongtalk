// 로그인 실패 리다이렉트 목적지 — 순수 함수. 카카오 콜백·애플 로그인(시작·마무리)·앱 핸드오프가 같이 쓴다.
// 실패는 어디서 출발했든 홈으로 간다(login=fail&reason). 로그인 전 맛보기(입구 반반) 때는 뽑기 이어가기(/tarot/draw…)만
// 그 화면으로 돌려보냈지만, 판정(2026-11-07 옛 흐름 고정)으로 그 화면의 실패 안내가 없어져 홈으로 되돌렸다.
// 목적지가 고정이라 next(사용자 입력)를 보지 않는다 — 다른 출처로 갈 길이 없다.
export function loginFailRedirectUrl(reason: string, baseUrl: string): URL {
  const u = new URL("/", baseUrl);
  u.searchParams.set("login", "fail");
  u.searchParams.set("reason", reason);
  return u;
}
