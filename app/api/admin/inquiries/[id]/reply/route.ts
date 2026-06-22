// app/api/admin/inquiries/[id]/reply/route.ts — 어드민 문의 답변 저장
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdminWrite, logAdminAction } from "@/lib/admin-actions";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminWrite(req);
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  let body: { answer?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (answer.length < 1 || answer.length > 4000) {
    return NextResponse.json({ error: "invalid_answer" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { data: updated, error } = await supabase
    .from("inquiries")
    .update({
      answer_body: answer,
      answered_at: new Date().toISOString(),
      answered_by: gate.userId,
      status: "answered",
      read_at: null, // 재답변 시 사용자가 다시 확인하도록 미확인으로
    })
    .eq("id", id)
    .select("id")
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await logAdminAction({
    adminId: gate.userId,
    action: "inquiry_reply",
    targetType: "inquiry",
    targetId: id,
    payload: { length: answer.length },
  });
  return NextResponse.json({ success: true });
}
