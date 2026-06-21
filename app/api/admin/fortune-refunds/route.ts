// app/api/admin/fortune-refunds/route.ts — 운세 자동환불 모니터링.
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const supabase = getServiceSupabase();
  const { data } = await supabase.from("fortune_refund_notices")
    .select("id, user_id, emotion_tag, refunded_stars, acknowledged_at, created_at")
    .order("created_at", { ascending: false }).limit(100);
  return NextResponse.json({ notices: data ?? [] });
}
