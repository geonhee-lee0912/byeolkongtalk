// lib/byeolmaru/subscription.ts — 별마루 구독 상수 + 구매 RPC 래퍼(서버 전용).
import { getServiceSupabase } from "@/lib/supabase";

export const BYEOLMARU_SUBSCRIPTION = { cost: 20, days: 30 } as const;

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
