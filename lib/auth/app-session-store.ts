// 앱 세션 저장소(Supabase). claim 은 조건부 UPDATE … RETURNING 한 문장이라 동시 요청 중 하나만 성공한다(원자성 계약).
import { getServiceSupabase } from "@/lib/supabase";
import type { AppSessionStore, Platform } from "./app-session";

export function supabaseAppSessionStore(): AppSessionStore {
  const db = getServiceSupabase();
  return {
    async insertRefresh(row) {
      const { error } = await db.from("app_refresh_tokens").insert(row);
      if (error) throw error;
    },
    async claimRefresh(tokenHash, nowIso) {
      const { data, error } = await db
        .from("app_refresh_tokens")
        .update({ rotated_at: nowIso })
        .eq("token_hash", tokenHash)
        .is("rotated_at", null)
        .is("revoked_at", null)
        .gt("expires_at", nowIso)
        .select("user_id, family_id, platform")
        .maybeSingle();
      if (error) throw error;
      return data
        ? { user_id: data.user_id as string, family_id: data.family_id as string, platform: (data.platform as Platform | null) ?? null }
        : null;
    },
    async releaseRefresh(tokenHash, rotatedAtIso) {
      const { error } = await db
        .from("app_refresh_tokens")
        .update({ rotated_at: null })
        .eq("token_hash", tokenHash)
        .eq("rotated_at", rotatedAtIso);
      if (error) throw error;
    },
    async findRefresh(tokenHash) {
      const { data, error } = await db
        .from("app_refresh_tokens")
        .select("family_id, user_id, platform, rotated_at, revoked_at, expires_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (error) throw error;
      return data
        ? {
            family_id: data.family_id as string,
            user_id: data.user_id as string,
            platform: (data.platform as Platform | null) ?? null,
            rotated_at: (data.rotated_at as string | null) ?? null,
            revoked_at: (data.revoked_at as string | null) ?? null,
            expires_at: data.expires_at as string,
          }
        : null;
    },
    async hasRotationAfter(familyId, rotatedAtIso) {
      // 교체 행은 지워지지 않아 오래 쓴 기기의 묶음은 Max rows(1000)를 넘는다 — 묶음 전체를 읽지 않고 1행만 묻는다
      const { data, error } = await db
        .from("app_refresh_tokens")
        .select("token_hash")
        .eq("family_id", familyId)
        .gt("rotated_at", rotatedAtIso)
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
    async hasRevokeAfter(familyId, sinceIso) {
      const { data, error } = await db
        .from("app_refresh_tokens")
        .select("token_hash")
        .eq("family_id", familyId)
        .gt("revoked_at", sinceIso)
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
    async listLiveRefresh(familyId) {
      const { data, error } = await db
        .from("app_refresh_tokens")
        .select("token_hash, user_id, platform, expires_at")
        .eq("family_id", familyId)
        .is("rotated_at", null)
        .is("revoked_at", null);
      if (error) throw error;
      return (data ?? []).map((x) => ({
        token_hash: x.token_hash as string,
        user_id: x.user_id as string,
        platform: (x.platform as Platform | null) ?? null,
        expires_at: x.expires_at as string,
      }));
    },
    async revokeUnusedRefresh(tokenHash, nowIso) {
      const { data, error } = await db
        .from("app_refresh_tokens")
        .update({ revoked_at: nowIso })
        .eq("token_hash", tokenHash)
        .is("rotated_at", null)
        .is("revoked_at", null)
        .select("token_hash")
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },
    async unrevokeRefresh(tokenHash, revokedAtIso) {
      const { error } = await db
        .from("app_refresh_tokens")
        .update({ revoked_at: null })
        .eq("token_hash", tokenHash)
        .eq("revoked_at", revokedAtIso);
      if (error) throw error;
    },
    async revokeFamily(familyId, nowIso) {
      const { error } = await db
        .from("app_refresh_tokens")
        .update({ revoked_at: nowIso })
        .eq("family_id", familyId)
        .is("revoked_at", null);
      if (error) throw error;
    },
    async insertHandoff(row) {
      const { error } = await db.from("app_handoff_codes").insert(row);
      if (error) throw error;
    },
    async claimHandoff(codeHash, nowIso) {
      const { data, error } = await db
        .from("app_handoff_codes")
        .update({ used_at: nowIso })
        .eq("code_hash", codeHash)
        .is("used_at", null)
        .gt("expires_at", nowIso)
        .select("user_id, is_new_user")
        .maybeSingle();
      if (error) throw error;
      return data ? { user_id: data.user_id as string, is_new_user: data.is_new_user as boolean } : null;
    },
  };
}
