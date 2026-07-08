// app/api/admin/analytics/products/route.ts — 상품별 집계(고민톡/운세/별구매).
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { adminExclusionList } from "@/lib/admin";
import { daysAgoKstIso } from "@/lib/admin-time";
import { buildProductBreakdown } from "@/lib/analytics/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 30)));
  const since = daysAgoKstIso(days - 1);
  const supa = getServiceSupabase();

  // 어드민(운영자) 활동 제외 — 테스트 결제/리딩 지표 오염 방지
  const excl = adminExclusionList();
  let readingsQ = supa
    .from("readings")
    .select("user_id, consultation_type, emotion_tag, saju_product, stars_spent, created_at")
    .gte("created_at", since)
    .limit(100000);
  let paymentsQ = supa
    .from("payments")
    .select("user_id, amount_won, package_type, status, created_at")
    .gte("created_at", since)
    .limit(100000);
  if (excl) {
    readingsQ = readingsQ.not("user_id", "in", excl);
    paymentsQ = paymentsQ.not("user_id", "in", excl);
  }
  const [{ data: readings }, { data: payments }] = await Promise.all([
    readingsQ,
    paymentsQ,
  ]);

  return NextResponse.json({
    days,
    ...buildProductBreakdown(readings ?? [], payments ?? []),
  });
}
