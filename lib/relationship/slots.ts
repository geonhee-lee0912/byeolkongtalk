// lib/relationship/slots.ts — 관계 슬롯 조회/구매 (DB 래퍼)
import { getServiceSupabase } from "@/lib/supabase";
import { SLOT_COST, slotAllowance } from "./types";

/** 유저 슬롯 현황: 허용 관계 수 / 현재 관계 수 / 무료로 더 추가 가능한지 / 다음 슬롯 가격. */
export async function getSlotInfo(userId: string): Promise<{
  allowed: number; used: number; canAddFree: boolean; nextCost: number;
}> {
  const supabase = getServiceSupabase();
  const [{ count: purchased }, { count: used }] = await Promise.all([
    supabase.from("star_transactions").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("source", "relationship_slot"),
    supabase.from("relationships").select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);
  const allowed = slotAllowance(purchased ?? 0);
  const usedN = used ?? 0;
  return { allowed, used: usedN, canAddFree: usedN < allowed, nextCost: SLOT_COST };
}

/** 슬롯 구매 — RPC 래퍼(원자 차감). 관계 생성은 호출측(POST)에서. */
export async function purchaseSlot(userId: string): Promise<{
  success: boolean; balance: number; reason?: string;
}> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc("purchase_relationship_slot", {
    p_user_id: userId, p_cost: SLOT_COST,
  });
  if (error) return { success: false, balance: 0, reason: "rpc_error" };
  return { success: !!data.success, balance: data.balance_after ?? 0, reason: data.reason };
}
