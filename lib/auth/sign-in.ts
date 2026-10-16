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
  /** users.kakao_id 로 회원 찾기 — 로그인 수단 행 유무로 거르지 말 것(옮겨 담기 전 회원 자가 치유와 동시 가입 승자 찾기에 같이 쓴다) */
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
  /** 신규 회원 처리 — 유입 기록·별 잔액·웰컴 별(이 해시로 1회)·CAPI.
   *  가입은 이미 끝난 뒤라 throw 하지 말 것(실패는 안에서 로그) — throw 하면 라우트가 로그인 실패로 보내고, 다시 로그인하면 기존 회원이라 신규 처리를 다시 타지 않는다 */
  onNewUser(userId: string, identityHashValue: string): Promise<void>;
}

export async function signIn(input: SignInInput, deps: SignInDeps): Promise<SignInResult> {
  const { provider, providerUserId } = input;
  const isKakao = provider === "kakao";
  // 회원번호가 이상하면 DB 를 건드리기 전에 멈춘다. 카카오 웹 콜백은 /v2/user/me 실패 응답이면 String(undefined) 를 넘기고,
  // users.kakao_id 는 이제 NULL 을 받는다(20261012000000) — 통과시키면 그런 사람들이 로그인 수단 ('kakao','undefined') 하나로 묶인다.
  const validId = isKakao ? /^[1-9]\d*$/.test(providerUserId) && Number.isSafeInteger(Number(providerUserId)) : providerUserId.length > 0;
  if (!validId) throw new Error(`signIn: invalid ${provider} providerUserId`);
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

  // 3) 기존 회원 — 동시 가입 경합에서 진 요청도 이긴 회원으로 여기를 지난다
  //    (애플: 같은 인가 코드 이중 전송이면 한쪽만 교환에 성공한다 — 진 쪽이 토큰을 들고 있으면 남겨야 탈퇴 때 revoke 할 수 있다)
  const loginExisting = async (id: string): Promise<SignInResult> => {
    await deps.updateUserOnLogin(id, isKakao ? { nickname: input.nickname, profile_img: input.profileImg } : {});
    await deps.updateIdentityOnLogin(provider, providerUserId, appleTouch);
    return { ok: true, userId: id, isNewUser: false };
  };
  if (userId) return loginExisting(userId);

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
      if (winner) return loginExisting(winner);
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
    const winner = ins.duplicate ? await deps.findIdentityUserId(provider, providerUserId) : null;
    // 카카오: 동시에 들어온 다른 요청이 방금 만든 이 회원을 '옮겨 담기 전 회원'으로 보고 로그인 수단을 먼저 붙였다 — 우리 회원이다.
    // 지우면 그 요청이 넘겨준 세션이 없는 회원을 가리키고 가입도 사라진다. 신규 처리는 이쪽이 한다(상대는 isNewUser:false 로 끝났다).
    if (winner !== created.id) {
      // 방금 만든 회원이 로그인 수단 없이 남으면 안 된다
      await deps.deleteUser(created.id);
      if (winner) return loginExisting(winner);
      return { ok: false, reason: "identity_insert_failed" };
    }
  }

  await deps.onNewUser(created.id, identityHash(provider, providerUserId));
  return { ok: true, userId: created.id, isNewUser: true };
}
