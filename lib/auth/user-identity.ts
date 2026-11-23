// 회원의 로그인 수단 조회 — 카카오 ID 를 읽던 곳(탈퇴·첫충전 보너스·내 정보·어드민)이 전부 여기로 온다(스펙 2026-10-12-앱-1 §8·§9).
// 옮겨 담기(마이그레이션)와 새 코드 배포 사이 틈에 옛 코드로 가입한 카카오 회원은 로그인 수단 행이 없다 → users.kakao_id 로 보충한다.
import { getServiceSupabase } from "@/lib/supabase";
import type { AuthProvider } from "./identity-hash";

export type UserIdentity = {
  provider: AuthProvider;
  providerUserId: string;
  appleClientId: string | null;
  appleRefreshTokenEnc: string | null;
};

/** 조회 실패는 throw — 호출처가 '없음'과 '실패'를 구분해야 한다(탈퇴는 실패면 멈춘다) */
export async function getUserIdentities(userId: string): Promise<UserIdentity[]> {
  const db = getServiceSupabase();
  const { data, error } = await db
    .from("user_identities")
    .select("provider, provider_user_id, apple_client_id, apple_refresh_token_enc")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (data && data.length > 0) {
    return data.map((r) => ({
      provider: r.provider as AuthProvider,
      providerUserId: r.provider_user_id as string,
      appleClientId: (r.apple_client_id as string | null) ?? null,
      appleRefreshTokenEnc: (r.apple_refresh_token_enc as string | null) ?? null,
    }));
  }
  const { data: u, error: uErr } = await db.from("users").select("kakao_id").eq("id", userId).maybeSingle();
  if (uErr) throw uErr;
  return u?.kakao_id != null
    ? [{ provider: "kakao", providerUserId: String(u.kakao_id), appleClientId: null, appleRefreshTokenEnc: null }]
    : [];
}

/** 대표 로그인 수단 — ①에는 계정 병합이 없어 회원당 1개다. 여럿이면 먼저 붙은 것 */
export function primaryIdentity(list: UserIdentity[]): UserIdentity | null {
  return list[0] ?? null;
}
