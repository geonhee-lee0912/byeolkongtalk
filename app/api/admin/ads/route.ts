// app/api/admin/ads/route.ts — 광고 지출 목록(GET).
// 수동 upsert(POST)는 2026-10-10 제거 — 입력 경로는 Meta API 동기화(/api/admin/ads/sync) 하나다.
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { data } = await getServiceSupabase()
    .from("ad_spend")
    .select("*")
    .order("spend_date", { ascending: false })
    .limit(500);
  return NextResponse.json({ rows: data ?? [] });
}

