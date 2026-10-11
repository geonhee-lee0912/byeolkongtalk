// lib/byeolmaru/subscription.ts — 별마루 구매 RPC 래퍼(서버 전용). 상수는 클라이언트 세이프인
// ./constants 로 분리돼 있다(이 파일은 getServiceSupabase 를 물고 있어 클라 번들에 못 들어감).
import { getServiceSupabase } from "@/lib/supabase";
import { BYEOLMARU_SUBSCRIPTION } from "./constants";

/** days = 이번 구매의 p_days — 호출부(구독 라우트)가 체험 단계로 정한다(subscribe-offer.ts
 *  subscriptionPurchaseDays). 가격은 언제나 BYEOLMARU_SUBSCRIPTION.cost 다. */
export async function purchaseByeolmaruSubscription(
  userId: string,
  days: number
): Promise<{ success: boolean; reason?: string; balance: number; expiresAt?: string; error?: unknown }> {
  const supa = getServiceSupabase();
  const { data, error } = await supa.rpc("purchase_byeolmaru_subscription", {
    p_user_id: userId,
    p_cost: BYEOLMARU_SUBSCRIPTION.cost,
    p_days: days,
  });
  // 🔴 에러를 삼키지 않고 돌려준다 — 예전엔 여기서 버려져 라우트는 500 만 내고 /admin/errors 엔
  //    아무것도 안 남았다(prod 구매 경로가 한 번도 실행된 적 없어, 첫 고장을 못 볼 뻔했다).
  if (error || !data) {
    return { success: false, reason: "rpc_error", balance: 0, error: error ?? new Error("purchase_byeolmaru_subscription: no data") };
  }
  return {
    success: !!data.success,
    reason: data.reason,
    balance: data.balance_after ?? 0,
    expiresAt: data.expires_at,
  };
}
