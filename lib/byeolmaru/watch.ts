// lib/byeolmaru/watch.ts — 우리 오늘 "지켜보는 상대" 조회/추가/삭제 (DB 래퍼).
// lib/relationship/slots.ts 미러: 허용 = WATCH_FREE_SLOTS + 구매 슬롯. 별 차감은 spendStars.
import { getServiceSupabase } from "@/lib/supabase";
import { spendStars } from "@/lib/stars";
import { WATCH_FREE_SLOTS, WATCH_EXTRA_COST } from "./constants.ts";

export function watchAllowance(purchasedSlots: number): number {
  return WATCH_FREE_SLOTS + Math.max(0, purchasedSlots);
}

export interface WatchState {
  allowed: number;
  used: number;
  canAddFree: boolean;
  nextCost: number; // 다음 1명 담을 때 드는 별(0 = 무료)
}

export async function getWatchState(userId: string): Promise<WatchState> {
  const supabase = getServiceSupabase();
  const [{ count: purchased }, { count: used }] = await Promise.all([
    supabase.from("star_transactions").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("source", "byeolmaru_watch"),
    supabase.from("byeolmaru_watch").select("profile_id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);
  const allowed = watchAllowance(purchased ?? 0);
  const usedN = used ?? 0;
  const canAddFree = usedN < allowed;
  return { allowed, used: usedN, canAddFree, nextCost: canAddFree ? 0 : WATCH_EXTRA_COST };
}

/** 상대를 담는다. 무료 여유 없으면 WATCH_EXTRA_COST 별 차감 후 담는다.
 * profileId 는 반드시 이 유저 소유의 비-self user_profiles 여야 한다(라우트가 검증·중복 필터). */
export async function addWatch(
  userId: string, profileId: string
): Promise<{ success: boolean; charged: number; reason?: string; balance?: number }> {
  const supabase = getServiceSupabase();
  const state = await getWatchState(userId);

  let charged = 0;
  if (!state.canAddFree) {
    const res = await spendStars(userId, WATCH_EXTRA_COST, { source: "byeolmaru_watch" });
    if (!res.success) return { success: false, charged: 0, reason: res.reason, balance: res.balance };
    charged = WATCH_EXTRA_COST;
  }

  const { error } = await supabase.from("byeolmaru_watch").insert({ user_id: userId, profile_id: profileId });
  if (error) return { success: false, charged, reason: error.message };
  return { success: true, charged };
}

export async function removeWatch(userId: string, profileId: string): Promise<{ success: boolean }> {
  const supabase = getServiceSupabase();
  const { error } = await supabase.from("byeolmaru_watch")
    .delete().eq("user_id", userId).eq("profile_id", profileId);
  return { success: !error };
}
