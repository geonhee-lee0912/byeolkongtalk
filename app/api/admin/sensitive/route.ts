// app/api/admin/sensitive/route.ts
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const supabase = getServiceSupabase();
  const { data } = await supabase.from("sensitive_alerts")
    .select("*")
    .order("reviewed_at", { ascending: true, nullsFirst: true })
    .order("severity", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  return NextResponse.json({ alerts: data ?? [] });
}
