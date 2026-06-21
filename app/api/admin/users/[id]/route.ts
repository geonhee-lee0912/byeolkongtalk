// app/api/admin/users/[id]/route.ts — 사용자 상세.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const supabase = getServiceSupabase();
  const [user, balance, profiles, readingCount, grants] = await Promise.all([
    supabase.from("users").select("*").eq("id", id).single(),
    supabase.from("star_balances").select("balance").eq("user_id", id).single(),
    supabase.from("user_profiles").select("*").eq("user_id", id),
    supabase.from("readings").select("id", { count: "exact", head: true }).eq("user_id", id),
    supabase.from("fortune_free_grants").select("fortune_kind, bonus_count").eq("user_id", id),
  ]);

  if (user.error || !user.data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({
    user: user.data,
    balance: balance.data?.balance ?? 0,
    profiles: profiles.data ?? [],
    readingCount: readingCount.count ?? 0,
    grants: grants.data ?? [],
  });
}
