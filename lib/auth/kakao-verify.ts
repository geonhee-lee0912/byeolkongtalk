// 앱(카카오 SDK)이 보낸 카카오 액세스 토큰 확인 — 다른 카카오 앱에서 발급된 토큰을 거절해야 한다.
// 1) /v1/user/access_token_info 의 app_id 가 우리 카카오 앱(KAKAO_APP_ID)인지 2) /v2/user/me 로 회원번호·프로필.
// 카카오 토큰은 서버에 저장하지 않는다(애플 지침 5.1.1(v) — 소셜 토큰을 기기 밖에 두지 말 것).
export type KakaoIdentity = { kakaoId: string; nickname: string; profileImg: string | null };
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const INFO_URL = "https://kapi.kakao.com/v1/user/access_token_info";
const ME_URL = "https://kapi.kakao.com/v2/user/me";

export async function verifyKakaoAccessToken(
  accessToken: string,
  expectedAppId: string,
  fetchImpl: FetchLike = fetch,
): Promise<KakaoIdentity | null> {
  if (!accessToken || !expectedAppId) return null;
  const headers = { Authorization: `Bearer ${accessToken}` };

  const infoRes = await fetchImpl(INFO_URL, { headers });
  if (!infoRes.ok) return null;
  const info = (await infoRes.json().catch(() => null)) as { id?: number; app_id?: number } | null;
  if (!info || info.id == null || String(info.app_id) !== String(expectedAppId)) return null;

  const meRes = await fetchImpl(ME_URL, { headers });
  if (!meRes.ok) return null;
  const me = (await meRes.json().catch(() => null)) as {
    id?: number;
    kakao_account?: { profile?: { nickname?: string; profile_image_url?: string } };
  } | null;
  if (!me || me.id == null || String(me.id) !== String(info.id)) return null;

  const kakaoId = String(me.id);
  return {
    kakaoId,
    nickname: me.kakao_account?.profile?.nickname || `별콩이_${kakaoId}`,
    profileImg: me.kakao_account?.profile?.profile_image_url || null,
  };
}
