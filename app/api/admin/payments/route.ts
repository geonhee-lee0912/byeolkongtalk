// app/api/admin/payments/route.ts — 결제 내역.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const status = req.nextUrl.searchParams.get("status"); // pending|completed|refunded|null
  const supabase = getServiceSupabase();
  let query = supabase.from("payments")
    .select("id, user_id, pg_tid, amount_won, stars_given, package_type, status, created_at")
    .order("created_at", { ascending: false }).limit(50);
  if (status) query = query.eq("status", status);
  const { data } = await query;
  return NextResponse.json({ payments: data ?? [] });
}
