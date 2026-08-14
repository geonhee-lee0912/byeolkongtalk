// app/api/relationship/sim/quote/route.ts — 다음 시뮬 판의 자금원·비용 미리보기(진입 UI 정직한 가격). 차감 없음.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { SIM_COST, SIM_FREE_RUNWAY } from "@/lib/relationship/types";
import { resolveFunding } from "@/lib/relationship/sim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });

  const relationshipId = new URL(request.url).searchParams.get("relationshipId");
  if (!relationshipId) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const supabase = getServiceSupabase();
  const { data: rel } = await supabase
    .from("relationships").select("id, user_id").eq("id", relationshipId).maybeSingle();
  if (!rel || rel.user_id !== userId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { count: runwayUsed } = await supabase
    .from("readings").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("relationship_id", rel.id)
    .eq("consultation_type", "relationship_sim").eq("saju_data->>funding", "runway");
  let hookLastAt: string | null = null;
  if ((runwayUsed ?? 0) >= SIM_FREE_RUNWAY) {
    const { data: lastHook } = await supabase
      .from("readings").select("created_at")
      .eq("user_id", userId).eq("consultation_type", "relationship_sim").eq("saju_data->>funding", "hook")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    hookLastAt = lastHook?.created_at ?? null;
  }
  const funding = resolveFunding({ runwayUsed: runwayUsed ?? 0, hookLastAt, now: new Date() });
  return NextResponse.json({
    funding,
    cost: funding === "paid" ? SIM_COST : 0,
    runwayRemaining: Math.max(0, SIM_FREE_RUNWAY - (runwayUsed ?? 0)),
  });
}
