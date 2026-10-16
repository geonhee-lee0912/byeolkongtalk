// 앱 로그인 상태 — 리프레시 토큰은 기기 보안 저장소, 액세스 토큰은 메모리. 스펙 2026-10-12-앱-1 §7-3·§7-4.
// 순수 로직이다(저장소·API 주입 — 실물은 tokenStore.ts·api.ts, 테스트는 session.test.ts). react-native import 금지.

/** accessExpiresAt = 기기 시계 기준 만료(ms) — api.ts 가 서버의 accessExpiresIn(초)으로 '받은 시각 + n초'를 계산해 넣는다 */
export type Tokens = { accessToken: string; accessExpiresAt: number; refreshToken: string };
export type AppleFullName = { givenName: string | null; familyName: string | null } | null;
export type LoginPayload =
  | { provider: "kakao"; accessToken: string }
  | { provider: "apple"; identityToken: string; authorizationCode: string; nonce: string; fullName: AppleFullName };

export interface TokenStore {
  getRefresh(): Promise<string | null>;
  setRefresh(token: string): Promise<void>;
  clear(): Promise<void>;
}

export interface AuthApi {
  login(payload: LoginPayload): Promise<Tokens & { handoffCode: string; isNewUser: boolean }>;
  /** 서버가 거절(401 — 무효·재사용)하면 isAuthError 가 참인 에러를 던진다 */
  refresh(refreshToken: string): Promise<Tokens>;
  handoffCode(accessToken: string): Promise<string>;
  logout(refreshToken: string): Promise<void>;
}

/** 앱 실행 때 웹뷰 첫 주소 — 교환 코드로 쿠키 맞추기 / 토큰 없음 → 옛 쿠키 정리 / 네트워크 문제 → 그냥 열기(웹뷰 쿠키에 맡김) */
export type StartTarget = { kind: "handoff"; code: string } | { kind: "reset" } | { kind: "plain" };

/** 만료 이만큼 전이면 미리 갱신한다 */
const EARLY_REFRESH_MS = 60_000;

export function createAuthSession(deps: {
  store: TokenStore;
  api: AuthApi;
  isAuthError: (e: unknown) => boolean;
  now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  let access: { token: string; expiresAt: number } | null = null;
  let refreshing: Promise<string | null> | null = null;

  async function save(t: Tokens): Promise<void> {
    await deps.store.setRefresh(t.refreshToken);
    access = { token: t.accessToken, expiresAt: t.accessExpiresAt };
  }

  async function refreshOnce(): Promise<string | null> {
    const refreshToken = await deps.store.getRefresh();
    if (!refreshToken) return null;
    try {
      const t = await deps.api.refresh(refreshToken);
      await save(t);
      return t.accessToken;
    } catch (e) {
      if (!deps.isAuthError(e)) throw e;
      // 무효·재사용 — 이 기기 로그인은 끝났다
      access = null;
      await deps.store.clear();
      return null;
    }
  }

  /** 유효한 액세스 토큰. 로그인 안 됨이면 null, 네트워크 문제면 throw. 동시에 불려도 갱신은 한 번만 한다 */
  async function ensureAccessToken(): Promise<string | null> {
    if (access && access.expiresAt - now() > EARLY_REFRESH_MS) return access.token;
    if (!refreshing) {
      refreshing = refreshOnce().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  async function startTarget(): Promise<StartTarget> {
    let token: string | null;
    try {
      token = await ensureAccessToken();
    } catch {
      return { kind: "plain" };
    }
    if (!token) return { kind: "reset" };
    try {
      return { kind: "handoff", code: await deps.api.handoffCode(token) };
    } catch {
      return { kind: "plain" };
    }
  }

  async function login(payload: LoginPayload): Promise<{ handoffCode: string; isNewUser: boolean }> {
    const r = await deps.api.login(payload);
    await save(r);
    return { handoffCode: r.handoffCode, isNewUser: r.isNewUser };
  }

  /** 기기 토큰을 지우고 서버에 그 기기 묶음 폐기를 알린다(서버 실패는 무시 — 기기엔 이미 없다) */
  async function logout(): Promise<void> {
    // 진행 중인 갱신이 끝난 뒤의 토큰으로 — 늦게 끝난 갱신이 로그아웃 뒤에 토큰을 되살리지 않게
    await refreshing?.catch(() => null);
    // 보안 저장소 읽기·지우기가 실패해도(키체인 오류) 할 수 있는 건 끝까지 한다 — 웹은 이미 로그아웃됐고, 못 지운 토큰이 서버에서도 살아 있으면
    // 다음 실행 때 앱이 조용히 다시 로그인시킨다. 서버 묶음만 폐기해 두면 그 토큰은 다음 실행에 401 → reset 으로 끝난다
    const refreshToken = await deps.store.getRefresh().catch(() => null);
    access = null;
    await deps.store.clear().catch(() => {});
    if (refreshToken) await deps.api.logout(refreshToken).catch(() => {});
  }

  return { ensureAccessToken, startTarget, login, logout };
}

export type AuthSession = ReturnType<typeof createAuthSession>;
