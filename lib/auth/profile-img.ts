// 카카오 프로필 사진 주소를 https 로 — 카카오 /v2/user/me 는 기본으로 http 주소를 준다(저장된 값이 prod·dev 전부 http, 2026-10-17 실측).
// 브라우저는 https 페이지 속 http 이미지를 https 로 올려 보여 주지만 안드로이드 웹뷰(앱)는 혼합 콘텐츠라 막는다 → 앱에서 프로필 사진이 깨졌다.
// 카카오 CDN(*.kakaocdn.net)만 바꾼다 — 같은 주소를 https 로 열면 200 인 것을 확인했다(k.kakaocdn.net·img1.kakaocdn.net). 그 밖의 주소는 그대로
const KAKAO_CDN_HTTP = /^http:\/\/(?:[a-z0-9-]+\.)+kakaocdn\.net(?=[/?#]|$)/i;

export function httpsProfileImg<T extends string | null>(url: T): T {
  if (!url || !KAKAO_CDN_HTTP.test(url)) return url;
  return `https://${url.slice("http://".length)}` as T;
}
