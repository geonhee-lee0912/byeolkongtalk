// app/api/admin/readings/[id]/route.ts — 리딩 상세 + 삭제.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin, requireAdminWrite, logAdminAction } from "@/lib/admin-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const supabase = getServiceSupabase();
  const [reading, messages] = await Promise.all([
    supabase.from("readings").select("*").eq("id", id).single(),
    supabase.from("messages").select("role, content, created_at").eq("reading_id", id).order("created_at", { ascending: true }),
  ]);
  if (!reading.data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ reading: reading.data, messages: messages.data ?? [] });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminWrite(req);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const supabase = getServiceSupabase();
  // messages 는 reading FK CASCADE 로 함께 삭제됨 (saju_core 마이그레이션).
  const { data, error } = await supabase.from("readings").delete().eq("id", id).select("id");
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await logAdminAction({ adminId: gate.userId, action: "reading_delete", targetType: "reading", targetId: id });
  return NextResponse.json({ success: true });
}
