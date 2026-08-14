// app/api/relationship/sim/quote/route.ts — 다음 시뮬 판의 자금원·비용 미리보기(진입 UI 정직한 가격). 차감 없음.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { checkRateLimit, maybeSweepExpired } from "@/lib/ratelimit";
import { SIM_COST, SIM_FREE_RUNWAY } from "@/lib/relationship/types";
import { determineSimFunding } from "@/lib/relationship/sim-funding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });

  maybeSweepExpired();
  const bySession = checkRateLimit({ namespace: "sim_quote", key: userId, max: 60, windowMs: 60_000 });
  if (!bySession.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } });

  const relationshipId = new URL(request.url).searchParams.get("relationshipId");
  if (!relationshipId) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const supabase = getServiceSupabase();
  const { data: rel } = await supabase
    .from("relationships").select("id, user_id").eq("id", relationshipId).maybeSingle();
  if (!rel || rel.user_id !== userId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { funding, runwayUsed } = await determineSimFunding(supabase, userId, rel.id);
  return NextResponse.json({
    funding,
    cost: funding === "paid" ? SIM_COST : 0,
    runwayRemaining: Math.max(0, SIM_FREE_RUNWAY - runwayUsed),
  });
}
