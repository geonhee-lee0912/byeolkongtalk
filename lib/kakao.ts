// 카카오 OAuth 저수준 API 호출 + 회원 탈퇴 시 unlink.

const KAKAO_AUTH_URL = "https://kauth.kakao.com";
const KAKAO_API_URL = "https://kapi.kakao.com";

export function getKakaoLoginUrl(): string {
  const params = new URLSearchParams({
    client_id: process.env.KAKAO_CLIENT_ID!,
    redirect_uri: process.env.KAKAO_REDIRECT_URI!,
    response_type: "code",
  });
  return `${KAKAO_AUTH_URL}/oauth/authorize?${params}`;
}

export async function getKakaoToken(code: string) {
  const res = await fetch(`${KAKAO_AUTH_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.KAKAO_CLIENT_ID!,
      client_secret: process.env.KAKAO_CLIENT_SECRET!,
      redirect_uri: process.env.KAKAO_REDIRECT_URI!,
      code,
    }),
  });
  return res.json();
}

export async function getKakaoUser(accessToken: string) {
  const res = await fetch(`${KAKAO_API_URL}/v2/user/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.json();
}

/**
 * 카카오 계정 연결 해제 (회원 탈퇴 시 호출).
 * Admin Key 로 user_id 기반 unlink. 실패 시 false — 호출자가 503 처리 결정.
 */
export async function unlinkKakao(kakaoId: number | string): Promise<boolean> {
  const adminKey = process.env.KAKAO_ADMIN_KEY;
  if (!adminKey) {
    console.warn("KAKAO_ADMIN_KEY not set; unlink skipped");
    return false;
  }
  try {
    const res = await fetch(`${KAKAO_API_URL}/v1/user/unlink`, {
      method: "POST",
      headers: {
        Authorization: `KakaoAK ${adminKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        target_id_type: "user_id",
        target_id: String(kakaoId),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn("unlinkKakao non-ok:", res.status, data);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("unlinkKakao error:", e);
    return false;
  }
}
