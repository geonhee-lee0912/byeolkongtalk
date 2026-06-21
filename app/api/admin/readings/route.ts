// app/api/admin/readings/route.ts — 리딩 목록 (사주/타로/운세 통합 필터).
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const sp = req.nextUrl.searchParams;
  const type = sp.get("type"); // 'saju' | 'tarot' | null
  const free = sp.get("free"); // '1' = 무료만, '0' = 유료만
  const page = Math.max(0, Number(sp.get("page") ?? 0));
  const size = 30;

  const supabase = getServiceSupabase();
  let query = supabase.from("readings")
    .select("id, user_id, consultation_type, emotion_tag, saju_product, stars_spent, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * size, page * size + size - 1);
  if (type === "saju" || type === "tarot") query = query.eq("consultation_type", type);
  if (free === "1") query = query.eq("stars_spent", 0);
  if (free === "0") query = query.gt("stars_spent", 0);

  const { data, count } = await query;
  return NextResponse.json({ readings: data ?? [], total: count ?? 0, page, size });
}
