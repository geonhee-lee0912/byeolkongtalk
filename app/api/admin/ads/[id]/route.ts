// app/api/admin/ads/[id]/route.ts — 광고 지출 행 삭제.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdminWrite, logAdminAction } from "@/lib/admin-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminWrite(req);
  if (gate instanceof NextResponse) return gate;
  const { id } = await ctx.params;

  const { error } = await getServiceSupabase().from("ad_spend").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction({
    adminId: gate.userId,
    action: "ad_spend_delete",
    targetType: "ad_spend",
    targetId: id,
  });
  return NextResponse.json({ ok: true });
}
