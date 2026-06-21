// app/api/admin/users/route.ts — 사용자 목록/검색.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const page = Math.max(0, Number(req.nextUrl.searchParams.get("page") ?? 0));
  const size = 30;

  const supabase = getServiceSupabase();
  let query = supabase
    .from("users")
    .select("id, nickname, kakao_id, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * size, page * size + size - 1);
  if (q) {
    const escaped = q.replace(/[%_]/g, "\\$&");
    query = query.ilike("nickname", `%${escaped}%`);
  }

  const { data, count } = await query;
  return NextResponse.json({ users: data ?? [], total: count ?? 0, page, size });
}
