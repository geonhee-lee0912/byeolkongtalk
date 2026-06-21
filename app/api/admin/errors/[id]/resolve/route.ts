// app/api/admin/errors/[id]/resolve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdminWrite, logAdminAction } from "@/lib/admin-actions";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminWrite(req);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const supabase = getServiceSupabase();
  const { data: updated, error } = await supabase.from("error_logs")
    .update({ resolved_at: new Date().toISOString(), resolved_by: gate.userId })
    .eq("id", id)
    .select("id")
    .single();
  if (error && error.code !== "PGRST116") return NextResponse.json({ error: "update_failed" }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await logAdminAction({ adminId: gate.userId, action: "error_resolve", targetType: "error_log", targetId: id });
  return NextResponse.json({ success: true });
}
