// 앱(카카오 SDK)이 보낸 카카오 액세스 토큰 확인 — 다른 카카오 앱에서 발급된 토큰을 거절해야 한다.
// 1) /v1/user/access_token_info 의 app_id 가 우리 카카오 앱(KAKAO_APP_ID)인지 2) /v2/user/me 로 회원번호·프로필.
// 카카오 토큰은 서버에 저장하지 않는다(애플 지침 5.1.1(v) — 소셜 토큰을 기기 밖에 두지 말 것).
// 계약: 토큰 무효(카카오 401·-2)면 {ok:false, reason:"token_invalid"}, 다른 앱 토큰이면 {ok:false, reason:"app_mismatch", appId}.
//       카카오 쪽 장애(-1·-7·-10 은 HTTP 400, 5xx)·이상한 응답·네트워크 오류·타임아웃(두 호출 합쳐 5초)·앱 ID 설정 오류는 throw
//       — 호출 라우트가 500 + 오류 로그로 남긴다(조용히 '무효 토큰' 으로 접히지 않게).
export type KakaoIdentity = { kakaoId: string; nickname: string; profileImg: string | null };
export type KakaoVerifyResult =
  | ({ ok: true } & KakaoIdentity)
  | { ok: false; reason: "token_invalid" }
  | { ok: false; reason: "app_mismatch"; appId: number };
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const INFO_URL = "https://kapi.kakao.com/v1/user/access_token_info";
const ME_URL = "https://kapi.kakao.com/v2/user/me";
const TIMEOUT_MS = 5_000;
const TOKEN_INVALID = { ok: false, reason: "token_invalid" } as const;

/** 카카오가 거절한 응답 — 토큰 무효(401·-2)면 token_invalid, 그 밖(카카오 쪽 장애)은 throw */
async function rejected(res: Response): Promise<typeof TOKEN_INVALID> {
  const code = ((await res.json().catch(() => null)) as { code?: unknown } | null)?.code;
  if (res.status === 401 || code === -2) return TOKEN_INVALID;
  throw new Error(`kakao ${res.status} code=${String(code)}`);
}

export async function verifyKakaoAccessToken(
  accessToken: string,
  expectedAppId: string,
  fetchImpl: FetchLike = fetch,
): Promise<KakaoVerifyResult> {
  // 헤더에 못 싣는 값·지나치게 긴 값은 카카오에 묻기 전에 무효(진짜 토큰엔 이런 문자가 없다)
  if (!/^[\x21-\x7e]{1,2048}$/.test(accessToken)) return TOKEN_INVALID;
  const appId = expectedAppId.trim();
  if (!/^\d+$/.test(appId)) throw new Error("KAKAO_APP_ID not set or not a number");
  const headers = { Authorization: `Bearer ${accessToken}` };
  const signal = AbortSignal.timeout(TIMEOUT_MS);

  const infoRes = await fetchImpl(INFO_URL, { headers, signal });
  if (!infoRes.ok) return rejected(infoRes);
  const info = (await infoRes.json()) as { id?: unknown; app_id?: unknown };
  if (typeof info.app_id !== "number" || !Number.isSafeInteger(info.id)) {
    throw new Error("kakao access_token_info: unexpected body");
  }
  if (String(info.app_id) !== appId) return { ok: false, reason: "app_mismatch", appId: info.app_id };

  const meRes = await fetchImpl(ME_URL, { headers, signal });
  if (!meRes.ok) return rejected(meRes);
  const me = (await meRes.json()) as {
    id?: unknown;
    kakao_account?: { profile?: { nickname?: string; profile_image_url?: string } };
  };
  if (!Number.isSafeInteger(me.id) || (me.id as number) <= 0) throw new Error("kakao user/me: unexpected body");
  if (me.id !== info.id) throw new Error("kakao user/me: id differs from access_token_info");

  const kakaoId = String(me.id);
  return {
    ok: true,
    kakaoId,
    nickname: me.kakao_account?.profile?.nickname || `별콩이_${kakaoId}`,
    profileImg: me.kakao_account?.profile?.profile_image_url || null,
  };
}
