// lib/byeolmaru/subscription.ts — 별마루 구매 RPC 래퍼(서버 전용). 상수는 클라이언트 세이프인
// ./constants 로 분리돼 있다(이 파일은 getServiceSupabase 를 물고 있어 클라 번들에 못 들어감).
import { getServiceSupabase } from "@/lib/supabase";
import { BYEOLMARU_SUBSCRIPTION } from "./constants";

export async function purchaseByeolmaruSubscription(
  userId: string
): Promise<{ success: boolean; reason?: string; balance: number; expiresAt?: string }> {
  const supa = getServiceSupabase();
  const { data, error } = await supa.rpc("purchase_byeolmaru_subscription", {
    p_user_id: userId,
    p_cost: BYEOLMARU_SUBSCRIPTION.cost,
    p_days: BYEOLMARU_SUBSCRIPTION.days,
  });
  if (error || !data) return { success: false, reason: "rpc_error", balance: 0 };
  return {
    success: !!data.success,
    reason: data.reason,
    balance: data.balance_after ?? 0,
    expiresAt: data.expires_at,
  };
}
