// app/api/admin/users/[id]/stars/adjust/route.ts — 어드민 별 잔액 수동 조정.
// 양수 = chargeStars(멱등키 admin:<uuid>), 음수 = spendStars. star_transactions audit 유지.
import { NextRequest, NextResponse } from "next/server";
import { chargeStars, spendStars } from "@/lib/stars";
import { requireAdmin, logAdminAction } from "@/lib/admin-actions";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  let body: { delta?: unknown; reason?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const delta = typeof body.delta === "number" ? Math.trunc(body.delta) : NaN;
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 200) : "";
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 10000) {
    return NextResponse.json({ error: "invalid_delta" }, { status: 400 });
  }

  let result: { success: boolean; balance: number; reason?: string };
  if (delta > 0) {
    result = await chargeStars(id, delta, `admin:${crypto.randomUUID()}`, "admin_adjust");
  } else {
    result = await spendStars(id, Math.abs(delta), { source: "admin_adjust" });
  }
  if (!result.success) {
    return NextResponse.json({ error: "adjust_failed", reason: result.reason }, { status: 409 });
  }

  await logAdminAction({
    adminId: gate.userId, action: "star_adjust", targetType: "user", targetId: id,
    payload: { delta, reason, balanceAfter: result.balance },
  });
  return NextResponse.json({ success: true, balance: result.balance });
}
