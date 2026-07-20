// app/api/admin/analytics/products/route.ts — 상품별 집계(고민톡/운세/별구매).
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { adminExclusionList } from "@/lib/admin";
import { daysAgoKstIso } from "@/lib/admin-time";
import { buildProductBreakdown, buildStarSpendBreakdown, type StarTxRow, type ReadingInfo } from "@/lib/analytics/aggregate";

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

  // 별 소모 분석 — star_transactions(spend) + reading 조인으로 종목·상품 분류
  let txQ = supa
    .from("star_transactions")
    .select("user_id, type, amount, source, reading_id, created_at")
    .eq("type", "spend")
    .gte("created_at", since)
    .limit(100000);
  if (excl) txQ = txQ.not("user_id", "in", excl);
  const { data: tx } = await txQ;
  const rids = [...new Set((tx ?? []).map((t) => t.reading_id).filter(Boolean))] as string[];
  const readingsById = new Map<string, ReadingInfo>();
  if (rids.length) {
    const { data: rinfo } = await supa
      .from("readings")
      .select("id, consultation_type, emotion_tag, relationship_id, skill_key")
      .in("id", rids);
    for (const r of rinfo ?? [])
      readingsById.set(r.id, {
        consultation_type: r.consultation_type,
        emotion_tag: r.emotion_tag,
        relationship_id: r.relationship_id,
        skill_key: r.skill_key,
      });
  }
  const starSpend = buildStarSpendBreakdown((tx ?? []) as StarTxRow[], readingsById);

  return NextResponse.json({
    days,
    ...buildProductBreakdown(readings ?? [], payments ?? []),
    starSpend,
  });
}
