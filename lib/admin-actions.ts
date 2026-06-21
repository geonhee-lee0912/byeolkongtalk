// lib/admin-actions.ts — 어드민 API 공통 가드 + 감사 로그.
import { NextResponse, type NextRequest } from "next/server";
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

/**
 * write 라우트용 가드: CSRF Origin/Referer 검증 + 어드민 가드.
 * 읽기(GET) 라우트는 requireAdmin 그대로 사용.
 */
export async function requireAdminWrite(
  req: NextRequest
): Promise<{ userId: string } | NextResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const allowedOrigin = new URL(baseUrl).origin;
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const originOk = origin === allowedOrigin;
  const refererOk = referer ? referer.startsWith(allowedOrigin) : false;
  if (!originOk && !refererOk) {
    return NextResponse.json({ error: "csrf_blocked" }, { status: 403 });
  }
  return requireAdmin();
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
