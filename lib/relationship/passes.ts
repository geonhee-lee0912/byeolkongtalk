// lib/relationship/passes.ts
import { getServiceSupabase } from "@/lib/supabase";
import { startOfTodayKstIso } from "@/lib/admin-time";
import { PASS_PLAN_BY_KIND, type PassKind } from "./types";

export interface ActivePass { id: string; kind: string; expires_at: string; }

/** relationship의 현재 활성 패스(가장 늦은 만료). 없으면 null. */
export async function getActivePass(relationshipId: string): Promise<ActivePass | null> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("relationship_passes")
    .select("id, kind, expires_at")
    .eq("relationship_id", relationshipId)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** 오늘(KST) 스레드에 쌓인 user 턴 수. */
export async function getTodayThreadTurns(threadReadingId: string | null): Promise<number> {
  if (!threadReadingId) return 0;
  const supabase = getServiceSupabase();
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("reading_id", threadReadingId)
    .eq("role", "user")
    .gte("created_at", startOfTodayKstIso());
  return count ?? 0;
}

/** 오늘(KST) 연장 구매 횟수(source='rel_extend'). */
export async function getTodayExtendCount(userId: string): Promise<number> {
  const supabase = getServiceSupabase();
  const { count } = await supabase
    .from("star_transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("source", "rel_extend")
    .gte("created_at", startOfTodayKstIso());
  return count ?? 0;
}

/** 패스 구매 — RPC 래퍼. cost/days는 서버 config에서(위조 차단). */
export async function purchasePass(userId: string, relationshipId: string, kind: PassKind) {
  const plan = PASS_PLAN_BY_KIND[kind];
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc("purchase_relationship_pass", {
    p_user_id: userId, p_relationship_id: relationshipId,
    p_kind: kind, p_cost: plan.cost, p_days: plan.days,
  });
  if (error) return { success: false as const, reason: "rpc_error" };
  return {
    success: !!data.success as boolean,
    reason: data.reason as string | undefined,
    balance: (data.balance_after ?? 0) as number,
    expiresAt: data.expires_at as string | undefined,
  };
}
