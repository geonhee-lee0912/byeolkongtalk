// app/api/inquiries/[id]/route.ts — 내 문의 단건(GET, 답변 확인 시 read_at 마킹) / 삭제(DELETE, open 한정)
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/inquiries/[id] — 내 문의 단건. 답변이 있고 미확인이면 read_at 마킹.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const { data: row } = await supabase
    .from("inquiries")
    .select("id, category, title, body, status, answer_body, answered_at, read_at, created_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // 답변 확인 시점 마킹 (배지 해제). 이미 읽었으면 그대로.
  if (row.status === "answered" && !row.read_at) {
    await supabase
      .from("inquiries")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId);
  }
  return NextResponse.json({ inquiry: row });
}

// DELETE /api/inquiries/[id] — 내 문의 삭제. status='open' 일 때만 허용(답변 후 삭제 금지).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const { data: owned } = await supabase
    .from("inquiries")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!owned) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (owned.status !== "open") {
    return NextResponse.json({ error: "already_answered" }, { status: 409 });
  }

  const { error } = await supabase
    .from("inquiries")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "open"); // 경합 방어: 삭제 직전 답변되면 0행 삭제
  if (error) {
    await logError(error, { route: "/api/inquiries/[id]", userId, extra: { stage: "delete", id } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
