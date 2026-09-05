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

/** 상대를 담는다. insert 를 먼저 해 동시 중복(PK 충돌)이면 별을 안 태우고, 과금은 insert 성공 뒤에만.
 * 과금 실패 시 방금 넣은 행을 롤백한다. profileId 소유·비-self·생일·순차중복은 라우트가 선검증. */
export async function addWatch(
  userId: string, profileId: string
): Promise<{ success: boolean; charged: number; reason?: string; balance?: number; alreadyWatched?: boolean }> {
  const supabase = getServiceSupabase();
  const state = await getWatchState(userId);
  const needsCharge = !state.canAddFree;

  // 1) 먼저 담는다 — 동시 중복이면 여기서 PK 충돌(23505)로 걸려 별을 안 태운다.
  const { error: insErr } = await supabase.from("byeolmaru_watch").insert({ user_id: userId, profile_id: profileId });
  if (insErr) {
    if ((insErr as { code?: string }).code === "23505") return { success: true, charged: 0, alreadyWatched: true };
    return { success: false, charged: 0, reason: insErr.message };
  }

  // 2) 필요하면 과금 — 실패 시 방금 넣은 행을 롤백(무료 미결제 행이 남지 않게).
  if (needsCharge) {
    const res = await spendStars(userId, WATCH_EXTRA_COST, { source: "byeolmaru_watch" });
    if (!res.success) {
      await supabase.from("byeolmaru_watch").delete().eq("user_id", userId).eq("profile_id", profileId);
      return { success: false, charged: 0, reason: res.reason, balance: res.balance };
    }
    return { success: true, charged: WATCH_EXTRA_COST };
  }
  return { success: true, charged: 0 };
}

export async function removeWatch(userId: string, profileId: string): Promise<{ success: boolean }> {
  const supabase = getServiceSupabase();
  const { error } = await supabase.from("byeolmaru_watch")
    .delete().eq("user_id", userId).eq("profile_id", profileId);
  return { success: !error };
}
