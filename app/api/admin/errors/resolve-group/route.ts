// app/api/admin/errors/resolve-group/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdminWrite, logAdminAction } from "@/lib/admin-actions";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const gate = await requireAdminWrite(req);
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({}));
  const { key } = body as { key?: string };
  if (!key) return NextResponse.json({ error: "key_required" }, { status: 400 });

  const supabase = getServiceSupabase();
  const now = new Date().toISOString();

  // Try fingerprint match first
  const { data: byFingerprint } = await supabase
    .from("error_logs")
    .update({ resolved_at: now, resolved_by: gate.userId })
    .eq("fingerprint", key)
    .is("resolved_at", null)
    .select("id");

  let updated = byFingerprint ?? [];

  // If no fingerprint match, try by id
  if (updated.length === 0) {
    const { data: byId } = await supabase
      .from("error_logs")
      .update({ resolved_at: now, resolved_by: gate.userId })
      .eq("id", key)
      .is("resolved_at", null)
      .select("id");
    updated = byId ?? [];
  }

  if (updated.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await logAdminAction({
    adminId: gate.userId,
    action: "error_resolve",
    targetType: "error_log",
    targetId: key,
    payload: { group: true, count: updated.length },
  });

  return NextResponse.json({ success: true });
}
