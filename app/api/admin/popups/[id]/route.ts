// app/api/admin/popups/[id]/route.ts — 팝업 회수(삭제). acks 는 CASCADE.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdminWrite, logAdminAction } from "@/lib/admin-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminWrite(req);
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const supa = getServiceSupabase();
  const { data: popup } = await supa
    .from("popups")
    .select("id, title, target_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!popup) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { error } = await supa.from("popups").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  await logAdminAction({
    adminId: gate.userId,
    action: "popup_revoke",
    targetType: "popup",
    targetId: id,
    payload: { title: popup.title, broadcast: popup.target_user_id === null },
  });

  return NextResponse.json({ ok: true });
}
