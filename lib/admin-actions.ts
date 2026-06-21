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
  // 동일 출처(same-origin) 요청만 허용. 요청이 실제 도달한 호스트 + 설정된
  // BASE_URL 호스트를 허용 목록으로 → 커스텀 도메인/www/vercel.app/로컬 모두 동작.
  // (cross-site 요청의 Origin/Referer 는 우리 호스트와 다르므로 차단됨.)
  const allowedHosts = new Set<string>();
  const selfHost =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (selfHost) allowedHosts.add(selfHost);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (baseUrl) {
    try {
      allowedHosts.add(new URL(baseUrl).host);
    } catch {
      // 무시 — 잘못된 BASE_URL 이어도 selfHost 로 검증
    }
  }

  const hostOf = (value: string | null): string | null => {
    if (!value) return null;
    try {
      return new URL(value).host;
    } catch {
      return null;
    }
  };
  const originHost = hostOf(req.headers.get("origin"));
  const refererHost = hostOf(req.headers.get("referer"));
  const ok =
    (!!originHost && allowedHosts.has(originHost)) ||
    (!!refererHost && allowedHosts.has(refererHost));
  if (!ok) {
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
