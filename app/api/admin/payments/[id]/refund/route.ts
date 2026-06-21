// app/api/admin/payments/[id]/refund/route.ts — 결제 환불/취소.
// 이미 refunded 면 멱등 응답. 토스 취소 성공 후 status='refunded'.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { cancelPayment } from "@/lib/toss";
import { requireAdmin, logAdminAction } from "@/lib/admin-actions";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  let body: { reason?: unknown };
  try { body = await req.json(); } catch { body = {}; }
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.slice(0, 200) : "관리자 환불";

  const supabase = getServiceSupabase();
  const { data: pay } = await supabase.from("payments")
    .select("id, pg_tid, status").eq("id", id).single();
  if (!pay) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (pay.status === "refunded") return NextResponse.json({ success: true, idempotent: true });
  if (pay.status !== "completed" || !pay.pg_tid) {
    return NextResponse.json({ error: "not_refundable" }, { status: 409 });
  }

  try {
    await cancelPayment(pay.pg_tid, reason); // pg_tid = 토스 paymentKey
  } catch {
    return NextResponse.json({ error: "toss_cancel_failed" }, { status: 502 });
  }
  const { error: dbErr } = await supabase.from("payments").update({ status: "refunded" }).eq("id", id);
  if (dbErr) {
    console.error("[admin refund] toss canceled but DB update failed", { id, dbErr });
    return NextResponse.json({ error: "db_update_failed" }, { status: 500 });
  }
  await logAdminAction({
    adminId: gate.userId, action: "payment_refund", targetType: "payment", targetId: id,
    payload: { reason },
  });
  return NextResponse.json({ success: true });
}
