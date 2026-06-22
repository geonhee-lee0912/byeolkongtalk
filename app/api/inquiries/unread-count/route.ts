// app/api/inquiries/unread-count/route.ts — 안 읽은 답변 수 (인앱 배지용)
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ count: 0 });

  const supabase = getServiceSupabase();
  const { count } = await supabase
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "answered")
    .is("read_at", null);

  return NextResponse.json({ count: count ?? 0 });
}
