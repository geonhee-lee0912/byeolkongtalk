// app/api/inquiries/route.ts — 내 문의 목록(GET) / 작성(POST)
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { logError } from "@/lib/logger";
import {
  isInquiryCategory,
  INQUIRY_TITLE_MAX,
  INQUIRY_BODY_MIN,
  INQUIRY_BODY_MAX,
} from "@/lib/inquiries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/inquiries — 내 문의 목록 (최신순)
export async function GET() {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ inquiries: [] });

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("inquiries")
    .select("id, category, title, status, answered_at, read_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ inquiries: [], error: error.message }, { status: 500 });
  }
  return NextResponse.json({ inquiries: data ?? [] });
}

// POST /api/inquiries — 문의 작성
export async function POST(req: NextRequest) {
  const { userId } = await getSession();
  if (!userId) {
    return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const b = body as { category?: unknown; title?: unknown; body?: unknown };
  if (!isInquiryCategory(b.category)) {
    return NextResponse.json({ error: "invalid_category" }, { status: 400 });
  }
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const content = typeof b.body === "string" ? b.body.trim() : "";
  if (title.length < 1 || title.length > INQUIRY_TITLE_MAX) {
    return NextResponse.json({ error: "invalid_title" }, { status: 400 });
  }
  if (content.length < INQUIRY_BODY_MIN || content.length > INQUIRY_BODY_MAX) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const supabase = getServiceSupabase();
  const { data: row, error } = await supabase
    .from("inquiries")
    .insert({ user_id: userId, category: b.category, title, body: content })
    .select("id")
    .single();

  if (error || !row) {
    await logError(error ?? new Error("inquiry insert null"), {
      route: "/api/inquiries",
      userId,
      extra: { stage: "insert" },
    });
    return NextResponse.json({ error: error?.message ?? "insert_failed" }, { status: 500 });
  }
  return NextResponse.json({ id: row.id });
}
