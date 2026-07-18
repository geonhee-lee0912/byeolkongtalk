// app/api/relationship/extend/route.ts — 오늘 소프트캡 +5턴 (5별). 연장 횟수 제한 없음(무제한).
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { spendStars } from "@/lib/stars";
import { getActivePass } from "@/lib/relationship/passes";
import { EXTEND_COST } from "@/lib/relationship/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "Login required" }, { status: 401 });
  const body = await request.json().catch(() => null) as { relationshipId?: string } | null;
  if (!body?.relationshipId) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const supabase = getServiceSupabase();
  const { data: rel } = await supabase.from("relationships").select("id, user_id, thread_reading_id").eq("id", body.relationshipId).maybeSingle();
  if (!rel || rel.user_id !== userId) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // 연장은 활성 패스가 있을 때만 의미 있음
  if (!(await getActivePass(rel.id))) return NextResponse.json({ error: "pass_required" }, { status: 402 });

  const spend = await spendStars(userId, EXTEND_COST, { readingId: rel.thread_reading_id, source: "rel_extend" });
  if (!spend.success)
    return NextResponse.json({ error: "INSUFFICIENT_STARS", reason: spend.reason, balance: spend.balance }, { status: 402 });
  return NextResponse.json({ success: true, balance: spend.balance });
}
