// app/api/admin/sensitive/[id]/review/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin, logAdminAction } from "@/lib/admin-actions";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  let body: { action?: unknown; note?: unknown };
  try { body = await req.json(); } catch { body = {}; }
  // action_taken 은 CHECK 제약 — 아래 enum 만 허용. 자유 메모는 review_note 로.
  const ALLOWED = ["no_action", "contacted", "forwarded", "false_positive"] as const;
  const actionTaken = ALLOWED.includes(body.action as (typeof ALLOWED)[number])
    ? (body.action as string)
    : "no_action";
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;

  const supabase = getServiceSupabase();
  const { error } = await supabase.from("sensitive_alerts")
    .update({
      reviewed_at: new Date().toISOString(),
      reviewed_by: gate.userId,
      action_taken: actionTaken,
      review_note: note,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 });

  await logAdminAction({ adminId: gate.userId, action: "sensitive_review", targetType: "sensitive_alert", targetId: id, payload: { actionTaken, note } });
  return NextResponse.json({ success: true });
}
