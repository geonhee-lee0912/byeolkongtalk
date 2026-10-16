// 공통 가입·로그인 — 카카오 웹 콜백 · 카카오 앱 · 애플 웹 · 애플 앱 네 경로가 모두 이걸 부른다(스펙 2026-10-12-앱-1 §7-1).
// 순수 오케스트레이션: DB·부수 작업은 deps 로 받는다(실 구현 lib/auth/sign-in-deps.ts, 테스트는 메모리 구현).
// 🔴 '이미 있던 회원'이면 onNewUser(유입 기록·별 잔액·웰컴 별·CAPI)를 절대 부르지 않는다 — 웰컴 별 중복 지급 방지.
import { identityHash, type AuthProvider } from "./identity-hash.ts";

export type SignInInput = {
  provider: AuthProvider;
  /** 카카오 회원번호(문자열) / 애플 sub */
  providerUserId: string;
  nickname: string;
  /** 카카오 프로필 이미지. 애플은 무시한다 */
  profileImg: string | null;
  /** 애플만 — 토큰을 발급한 client_id 와 암호화한 리프레시 토큰(교환 실패면 null) */
  apple?: { clientId: string; refreshTokenEnc: string | null };
};

export type SignInResult =
  | { ok: true; userId: string; isNewUser: boolean }
  | { ok: false; reason: "user_insert_failed" | "identity_insert_failed" };

export type IdentityInsert = {
  user_id: string;
  provider: AuthProvider;
  provider_user_id: string;
  apple_client_id: string | null;
  apple_refresh_token_enc: string | null;
};

export interface SignInDeps {
  findIdentityUserId(provider: AuthProvider, providerUserId: string): Promise<string | null>;
  /** 옮겨 담기 전 카카오 회원(users.kakao_id 만 있고 로그인 수단 행이 없는) */
  findLegacyKakaoUserId(kakaoId: string): Promise<string | null>;
  insertIdentity(row: IdentityInsert): Promise<{ ok: true } | { ok: false; duplicate: boolean }>;
  updateIdentityOnLogin(
    provider: AuthProvider,
    providerUserId: string,
    patch: { apple_client_id?: string; apple_refresh_token_enc?: string },
  ): Promise<void>;
  insertUser(row: { kakao_id: number | null; nickname: string; profile_img: string | null }): Promise<
    { ok: true; id: string } | { ok: false; duplicate: boolean }
  >;
  deleteUser(userId: string): Promise<void>;
  /** last_login 은 실 구현이 항상 갱신한다 */
  updateUserOnLogin(userId: string, patch: { nickname?: string; profile_img?: string | null }): Promise<void>;
  /** 신규 회원 처리 — 유입 기록·별 잔액·웰컴 별(이 해시로 1회)·CAPI */
  onNewUser(userId: string, identityHashValue: string): Promise<void>;
}

export async function signIn(input: SignInInput, deps: SignInDeps): Promise<SignInResult> {
  const { provider, providerUserId } = input;
  const isKakao = provider === "kakao";
  // 애플 재로그인 때 새 리프레시 토큰을 받았을 때만 갈아 끼운다(교환 실패 null 로 기존 토큰을 지우지 않는다)
  const appleTouch =
    input.apple?.refreshTokenEnc != null
      ? { apple_client_id: input.apple.clientId, apple_refresh_token_enc: input.apple.refreshTokenEnc }
      : {};

  // 1) 로그인 수단으로 찾기
  let userId = await deps.findIdentityUserId(provider, providerUserId);

  // 2) 옮겨 담기 전 카카오 회원 — 로그인 수단을 채우고 기존 회원으로 처리(자가 치유)
  if (!userId && isKakao) {
    const legacy = await deps.findLegacyKakaoUserId(providerUserId);
    if (legacy) {
      const ins = await deps.insertIdentity({
        user_id: legacy,
        provider,
        provider_user_id: providerUserId,
        apple_client_id: null,
        apple_refresh_token_enc: null,
      });
      if (!ins.ok && !ins.duplicate) return { ok: false, reason: "identity_insert_failed" };
      userId = legacy;
    }
  }

  // 3) 기존 회원
  if (userId) {
    await deps.updateUserOnLogin(userId, isKakao ? { nickname: input.nickname, profile_img: input.profileImg } : {});
    await deps.updateIdentityOnLogin(provider, providerUserId, appleTouch);
    return { ok: true, userId, isNewUser: false };
  }

  // 4) 신규 회원
  const created = await deps.insertUser({
    kakao_id: isKakao ? Number(providerUserId) : null,
    nickname: input.nickname,
    profile_img: isKakao ? input.profileImg : null,
  });
  if (!created.ok) {
    // 같은 카카오 회원의 동시 가입 — 먼저 만든 쪽으로 로그인
    if (created.duplicate && isKakao) {
      const winner = await deps.findLegacyKakaoUserId(providerUserId);
      if (winner) return { ok: true, userId: winner, isNewUser: false };
    }
    return { ok: false, reason: "user_insert_failed" };
  }

  const ins = await deps.insertIdentity({
    user_id: created.id,
    provider,
    provider_user_id: providerUserId,
    apple_client_id: input.apple?.clientId ?? null,
    apple_refresh_token_enc: input.apple?.refreshTokenEnc ?? null,
  });
  if (!ins.ok) {
    // 방금 만든 회원이 로그인 수단 없이 남으면 안 된다
    await deps.deleteUser(created.id);
    if (ins.duplicate) {
      const winner = await deps.findIdentityUserId(provider, providerUserId);
      if (winner) return { ok: true, userId: winner, isNewUser: false };
    }
    return { ok: false, reason: "identity_insert_failed" };
  }

  await deps.onNewUser(created.id, identityHash(provider, providerUserId));
  return { ok: true, userId: created.id, isNewUser: true };
}
