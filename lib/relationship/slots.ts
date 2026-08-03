// lib/relationship/slots.ts — 관계 슬롯 조회/구매 (DB 래퍼)
import { getServiceSupabase } from "@/lib/supabase";
import { spendStars } from "@/lib/stars";
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

/** 슬롯 구매 — lib/stars 의 spendStars 재사용(별 차감 + source 태깅). 관계 생성은 호출측(POST). */
export async function purchaseSlot(userId: string): Promise<{
  success: boolean; balance: number; reason?: string;
}> {
  const res = await spendStars(userId, SLOT_COST, { source: "relationship_slot" });
  return { success: res.success, balance: res.balance, reason: res.reason };
}
