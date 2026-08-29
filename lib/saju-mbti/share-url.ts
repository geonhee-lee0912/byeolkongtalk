// 사주 MBTI 결과 공유 URL — 결과 토큰(?r=) + utm 어트리뷰션.
// byeoljari lib/byeoljari/invite-link.ts 관행: utm_source/medium/content 로
// 유입·유형 귀속. utm 은 normalizePath(pageview.ts)가 스트립하므로 트래픽 표 무오염.
export function buildSajuMbtiShareUrl(
  origin: string,
  token: string,
  paljaCode: string
): string {
  const base = origin.replace(/\/$/, "");
  const params = new URLSearchParams({
    r: token,
    utm_source: "saju_mbti",
    utm_medium: "share",
    utm_content: paljaCode,
  });
  return `${base}/fortune/saju-mbti?${params.toString()}`;
}
