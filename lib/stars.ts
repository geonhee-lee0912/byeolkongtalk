// 별 재화 RPC 래퍼 — spend_stars / charge_stars (Phase 4 c 마이그레이션).
// Phase 5 (사주 도메인) 에서 무료 한도 / 가격표 헬퍼를 이 파일에 추가 예정.

import { getServiceSupabase } from "./supabase";

export async function getStarBalance(userId: string): Promise<number> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("star_balances")
    .select("balance")
    .eq("user_id", userId)
    .single();

  return data?.balance ?? 0;
}

/**
 * 별 차감. SELECT FOR UPDATE row lock 으로 동시 차감 직렬화.
 * readingId 는 Phase 5 에서 사주 풀이 결과 row 와 매칭 (현재는 null 허용).
 */
export async function spendStars(
  userId: string,
  amount: number,
  options?: { readingId?: string | null; source?: string }
): Promise<{
  success: boolean;
  balance: number;
  reason?: string;
  transactionId?: string;
}> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase.rpc("spend_stars", {
    p_user_id: userId,
    p_amount: amount,
    p_reading_id: options?.readingId ?? null,
    p_source: options?.source ?? "reading",
  });

  if (error) {
    console.error("spendStars error:", error);
    return { success: false, balance: 0, reason: "rpc_error" };
  }

  return {
    success: !!data.success,
    balance: data.balance_after ?? 0,
    reason: data.reason,
    transactionId: data.transaction_id,
  };
}

/**
 * 별 충전 (결제 승인 후). 같은 paymentId 재호출 시 멱등 응답.
 * Phase 3 PG 결정 후 결제 confirm 라우트에서 호출.
 */
export async function chargeStars(
  userId: string,
  amount: number,
  paymentId: string,
  source: string = "pg"
): Promise<{ success: boolean; balance: number; idempotent?: boolean }> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase.rpc("charge_stars", {
    p_user_id: userId,
    p_amount: amount,
    p_payment_id: paymentId,
    p_source: source,
  });

  if (error) {
    console.error("chargeStars error:", error);
    return { success: false, balance: 0 };
  }

  return {
    success: !!data.success,
    balance: data.balance_after ?? 0,
    idempotent: data.idempotent === true,
  };
}
