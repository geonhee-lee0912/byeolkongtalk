// 별자리 초대 링크 빌더 — utm 을 붙여 방문자 가입 시 user_acquisition(utm_source=byeoljari,
// utm_content=shareId)에 "어느 맵이 데려왔나"까지 first-class 로 남게 한다.
// AuthBootstrap → user_acquisition 파이프(components/auth/AuthBootstrap.tsx)에 그대로 올라탄다.

export function buildInviteUrl(origin: string, shareId: string): string {
  const base = origin.replace(/\/+$/, "");
  const params = new URLSearchParams({
    utm_source: "byeoljari",
    utm_medium: "invite",
    utm_content: shareId,
  });
  return `${base}/fortune/byeoljari/${shareId}?${params.toString()}`;
}
