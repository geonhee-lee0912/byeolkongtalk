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

export interface KakaoUnlinkResult {
  ok: boolean;
  /** 카카오가 -101 NotRegisteredUserException 반환 — 앱과 이미 연결이 없는 상태 (유저가 카카오 설정에서 직접 끊은 경우 등). OAuth 링크가 없으므로 탈퇴 진행해도 안전. */
  alreadyUnlinked: boolean;
  status?: number;
  code?: number;
}

/**
 * 카카오 계정 연결 해제 (회원 탈퇴 시 호출).
 * Admin Key 로 user_id 기반 unlink. 실패 시 status/code 포함 반환 — 호출자가 503 처리 결정.
 */
export async function unlinkKakao(
  kakaoId: number | string
): Promise<KakaoUnlinkResult> {
  const adminKey = process.env.KAKAO_ADMIN_KEY;
  if (!adminKey) {
    console.warn("KAKAO_ADMIN_KEY not set; unlink skipped");
    return { ok: false, alreadyUnlinked: false };
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
      const code = typeof data?.code === "number" ? data.code : undefined;
      return {
        ok: false,
        alreadyUnlinked: code === -101,
        status: res.status,
        code,
      };
    }
    return { ok: true, alreadyUnlinked: false };
  } catch (e) {
    console.warn("unlinkKakao error:", e);
    return { ok: false, alreadyUnlinked: false };
  }
}
