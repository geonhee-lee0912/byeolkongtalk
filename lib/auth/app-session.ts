// 앱 세션 — 액세스(1시간)·리프레시(90일, 쓸 때마다 교체) 토큰 발급, 재사용 감지, 웹뷰 교환 코드(60초·1회용).
// 저장소는 주입한다(실 구현 lib/auth/app-session-store.ts). '조건부 갱신이 원자적'이라는 계약은 저장소가 지킨다.
// 스펙 2026-10-12-앱-1 §7-4.
import { randomUUID } from "node:crypto";
import { ACCESS_TTL_SEC, signAccessToken } from "./app-token.ts";
import { HANDOFF_TTL_MS, REFRESH_TTL_MS, hashSecretToken, newSecretToken } from "./secret-token.ts";

export type Platform = "ios" | "android";

/** 교체 직후 이만큼 안에 같은 토큰이 또 오면(이중 전송) 묶음을 폐기하지 않고 거절만 한다 */
export const REUSE_GRACE_MS = 10_000;

export interface AppSessionStore {
  insertRefresh(row: { user_id: string; family_id: string; token_hash: string; platform: Platform | null; expires_at: string }): Promise<void>;
  /** 원자적: 교체·폐기 전이고 만료 전이면 rotated_at=now 로 표시하고 행을 돌려준다. 아니면 null */
  claimRefresh(tokenHash: string, nowIso: string): Promise<{ user_id: string; family_id: string; platform: Platform | null } | null>;
  /** claimRefresh 되돌리기 — rotated_at 이 그 claim 이 남긴 값일 때만 비운다(새 토큰을 못 만들었을 때 옛 토큰을 살려 둔다) */
  releaseRefresh(tokenHash: string, rotatedAtIso: string): Promise<void>;
  findRefresh(tokenHash: string): Promise<{ family_id: string; rotated_at: string | null; revoked_at: string | null } | null>;
  revokeFamily(familyId: string, nowIso: string): Promise<void>;
  insertHandoff(row: { code_hash: string; user_id: string; is_new_user: boolean; expires_at: string }): Promise<void>;
  /** 원자적: 안 쓰였고 만료 전이면 used_at=now 로 표시하고 돌려준다. 아니면 null */
  claimHandoff(codeHash: string, nowIso: string): Promise<{ user_id: string; is_new_user: boolean } | null>;
}

/** accessExpiresAt = 서버 시계 기준 만료(ms — 기록·디버그용). 기기 시계는 틀릴 수 있어 앱은 accessExpiresIn(초)으로 '받은 시각 + n초'를 계산한다 */
export type AppTokens = { accessToken: string; accessExpiresAt: number; accessExpiresIn: number; refreshToken: string };

export async function issueAppTokens(
  store: AppSessionStore,
  userId: string,
  platform: Platform | null,
  opts: { now?: number; familyId?: string } = {},
): Promise<AppTokens & { familyId: string }> {
  const now = opts.now ?? Date.now();
  const familyId = opts.familyId ?? randomUUID();
  const refreshToken = newSecretToken();
  await store.insertRefresh({
    user_id: userId,
    family_id: familyId,
    token_hash: hashSecretToken(refreshToken),
    platform,
    expires_at: new Date(now + REFRESH_TTL_MS).toISOString(),
  });
  const { token, expiresAt } = await signAccessToken(userId, { nowSec: Math.floor(now / 1000) });
  return { accessToken: token, accessExpiresAt: expiresAt, accessExpiresIn: ACCESS_TTL_SEC, refreshToken, familyId };
}

export type RotateResult =
  | { ok: true; userId: string; tokens: AppTokens }
  | { ok: false; reason: "invalid" | "reused" };

export async function rotateRefreshToken(
  store: AppSessionStore,
  refreshToken: string,
  opts: { now?: number } = {},
): Promise<RotateResult> {
  const now = opts.now ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const hash = hashSecretToken(refreshToken);
  const claimed = await store.claimRefresh(hash, nowIso);
  if (!claimed) {
    const row = await store.findRefresh(hash);
    if (row?.rotated_at && !row.revoked_at && now - Date.parse(row.rotated_at) > REUSE_GRACE_MS) {
      // 이미 교체된 토큰이 다시 왔다 — 탈취 가능성. 그 기기 묶음을 전부 폐기한다
      await store.revokeFamily(row.family_id, nowIso);
      return { ok: false, reason: "reused" };
    }
    return { ok: false, reason: "invalid" };
  }
  const t = await issueAppTokens(store, claimed.user_id, claimed.platform, { now, familyId: claimed.family_id }).catch(async (err: unknown) => {
    // 옛 토큰만 소모하고 새 토큰을 못 줬다(DB 순간 오류·서명 비밀값 설정 오류) — 그대로 두면 앱의 다음 시도가 invalid/reused 로
    // 로그아웃되고 가짜 '재사용' 경고까지 남는다. 옛 토큰을 되살려 다시 시도할 수 있게 한다(되살리기 실패는 삼키고 원래 오류를 올린다)
    await store.releaseRefresh(hash, nowIso).catch(() => {});
    throw err;
  });
  return {
    ok: true,
    userId: claimed.user_id,
    tokens: { accessToken: t.accessToken, accessExpiresAt: t.accessExpiresAt, accessExpiresIn: t.accessExpiresIn, refreshToken: t.refreshToken },
  };
}

export async function revokeByRefreshToken(
  store: AppSessionStore,
  refreshToken: string,
  opts: { now?: number } = {},
): Promise<void> {
  const row = await store.findRefresh(hashSecretToken(refreshToken));
  if (row) await store.revokeFamily(row.family_id, new Date(opts.now ?? Date.now()).toISOString());
}

export async function createHandoffCode(
  store: AppSessionStore,
  userId: string,
  isNewUser: boolean,
  opts: { now?: number } = {},
): Promise<string> {
  const now = opts.now ?? Date.now();
  const code = newSecretToken();
  await store.insertHandoff({
    code_hash: hashSecretToken(code),
    user_id: userId,
    is_new_user: isNewUser,
    expires_at: new Date(now + HANDOFF_TTL_MS).toISOString(),
  });
  return code;
}

export async function consumeHandoffCode(
  store: AppSessionStore,
  code: string,
  opts: { now?: number } = {},
): Promise<{ userId: string; isNewUser: boolean } | null> {
  if (!code || code.length > 100) return null;
  const r = await store.claimHandoff(hashSecretToken(code), new Date(opts.now ?? Date.now()).toISOString());
  return r ? { userId: r.user_id, isNewUser: r.is_new_user } : null;
}
