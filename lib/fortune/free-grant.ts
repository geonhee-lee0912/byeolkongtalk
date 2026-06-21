// lib/fortune/free-grant.ts — 어드민이 부여한 무료 운세 보너스 합산.
import { getServiceSupabase } from "@/lib/supabase";

/** 특정 유저·운세종류의 보너스 무료 횟수 합. fortuneKind = FortuneType 키. */
export async function getFortuneBonus(userId: string, fortuneKind: string): Promise<number> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("fortune_free_grants")
    .select("bonus_count")
    .eq("user_id", userId)
    .eq("fortune_kind", fortuneKind);
  return (data ?? []).reduce((s, r) => s + (r.bonus_count ?? 0), 0);
}
