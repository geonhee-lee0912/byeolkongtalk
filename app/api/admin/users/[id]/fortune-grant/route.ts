// app/api/admin/users/[id]/fortune-grant/route.ts — 무료 운세 보너스 횟수 부여.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdminWrite, logAdminAction } from "@/lib/admin-actions";
import { FORTUNE_CONFIG } from "@/lib/fortune/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminWrite(req);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  let body: { fortuneKind?: unknown; bonus?: unknown; reason?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const fortuneKind = typeof body.fortuneKind === "string" ? body.fortuneKind : "";
  const bonus = typeof body.bonus === "number" ? Math.trunc(body.bonus) : NaN;
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 200) : "";

  // freeLimit 이 있는(무료 정책이 있는) 운세 종류만 허용
  const cfg = FORTUNE_CONFIG[fortuneKind as keyof typeof FORTUNE_CONFIG];
  if (!cfg || !cfg.freeLimit) {
    return NextResponse.json({ error: "invalid_fortune_kind" }, { status: 400 });
  }
  if (!Number.isFinite(bonus) || bonus === 0 || Math.abs(bonus) > 100) {
    return NextResponse.json({ error: "invalid_bonus" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { error: insertError } = await supabase.from("fortune_free_grants").insert({
    user_id: id, fortune_kind: fortuneKind, bonus_count: bonus, granted_by: gate.userId, reason,
  });
  if (insertError) return NextResponse.json({ error: "db_error" }, { status: 500 });
  await logAdminAction({
    adminId: gate.userId, action: "fortune_grant", targetType: "user", targetId: id,
    payload: { fortuneKind, bonus, reason },
  });
  return NextResponse.json({ success: true });
}
