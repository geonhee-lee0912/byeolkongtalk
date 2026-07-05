// app/api/admin/ads/route.ts — 광고 지출 목록(GET) / upsert(POST).
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin, requireAdminWrite, logAdminAction } from "@/lib/admin-actions";

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

export async function POST(req: NextRequest) {
  const gate = await requireAdminWrite(req);
  if (gate instanceof NextResponse) return gate;

  const b = await req.json().catch(() => null);
  if (!b || !b.spend_date || b.spend_won == null) {
    return NextResponse.json({ error: "spend_date, spend_won 필수" }, { status: 400 });
  }
  const row = {
    spend_date: String(b.spend_date),
    platform: String(b.platform ?? "meta"),
    campaign: String(b.campaign ?? ""),
    adset: String(b.adset ?? ""),
    creative_key: String(b.creative_key ?? ""),
    impressions: b.impressions == null ? null : Number(b.impressions),
    clicks: b.clicks == null ? null : Number(b.clicks),
    spend_won: Number(b.spend_won),
    reach: b.reach == null ? null : Number(b.reach),
    note: b.note ? String(b.note) : null,
    created_by: gate.userId,
    updated_at: new Date().toISOString(),
  };
  const supa = getServiceSupabase();
  const { data, error } = await supa
    .from("ad_spend")
    .upsert(row, { onConflict: "spend_date,platform,campaign,adset,creative_key" })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction({
    adminId: gate.userId,
    action: "ad_spend_upsert",
    targetType: "ad_spend",
    targetId: data?.id ?? null,
    payload: { spend_date: row.spend_date, creative_key: row.creative_key, spend_won: row.spend_won },
  });
  return NextResponse.json({ ok: true, id: data?.id });
}
