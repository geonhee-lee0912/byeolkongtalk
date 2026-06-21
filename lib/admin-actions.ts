// lib/admin-actions.ts — 어드민 API 공통 가드 + 감사 로그.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isAdminAuthorized } from "@/lib/admin";
import { getServiceSupabase } from "@/lib/supabase";

/**
 * 어드민 API 가드. 통과 시 { userId } 반환, 아니면 NextResponse(403/401) 반환.
 * 사용: const gate = await requireAdmin(); if (gate instanceof NextResponse) return gate;
 */
export async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "login_required" }, { status: 401 });
  }
  if (!(await isAdminAuthorized(userId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return { userId };
}

export type AdminActionName =
  | "star_adjust"
  | "payment_refund"
  | "reading_delete"
  | "sensitive_review"
  | "error_resolve"
  | "fortune_grant";

export async function logAdminAction(params: {
  adminId: string;
  action: AdminActionName;
  targetType: string;
  targetId: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getServiceSupabase();
  await supabase.from("admin_actions").insert({
    admin_id: params.adminId,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId,
    payload: params.payload ?? null,
  });
}
