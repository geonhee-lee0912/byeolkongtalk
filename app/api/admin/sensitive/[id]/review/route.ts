// app/api/admin/sensitive/[id]/review/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdminWrite, logAdminAction } from "@/lib/admin-actions";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminWrite(req);
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
  const { data: updated, error } = await supabase.from("sensitive_alerts")
    .update({
      reviewed_at: new Date().toISOString(),
      reviewed_by: gate.userId,
      action_taken: actionTaken,
      review_note: note,
    })
    .eq("id", id)
    .select("id, reading_id")
    .single();
  if (error && error.code !== "PGRST116") return NextResponse.json({ error: "update_failed" }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // 오탐 판정 시 리딩의 공유 차단(has_sensitive) 해제 — 단, 같은 리딩에
  // 오탐이 아닌 다른 알림이 남아 있으면 차단 유지.
  if (actionTaken === "false_positive" && updated.reading_id) {
    const { count } = await supabase.from("sensitive_alerts")
      .select("id", { count: "exact", head: true })
      .eq("reading_id", updated.reading_id)
      .neq("id", id)
      .or("action_taken.is.null,action_taken.neq.false_positive");
    if ((count ?? 0) === 0) {
      await supabase.from("readings")
        .update({ has_sensitive: false })
        .eq("id", updated.reading_id);
    }
  }

  await logAdminAction({ adminId: gate.userId, action: "sensitive_review", targetType: "sensitive_alert", targetId: id, payload: { actionTaken, note } });
  return NextResponse.json({ success: true });
}
