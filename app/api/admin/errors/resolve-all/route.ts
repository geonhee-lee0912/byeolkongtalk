import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdminWrite, logAdminAction } from "@/lib/admin-actions";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const gate = await requireAdminWrite(req);
  if (gate instanceof NextResponse) return gate;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("error_logs")
    .update({ resolved_at: new Date().toISOString(), resolved_by: gate.userId })
    .is("resolved_at", null)
    .select("id");
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });
  const count = data?.length ?? 0;
  await logAdminAction({ adminId: gate.userId, action: "error_resolve", targetType: "error_log", targetId: "ALL", payload: { all: true, count } });
  return NextResponse.json({ success: true, count });
}
