// app/api/relationship/pass/route.ts — 관계 패스 구매 (1일/3일/7일권)
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { purchasePass } from "@/lib/relationship/passes";
import { PASS_PLAN_BY_KIND, type PassKind } from "@/lib/relationship/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { userId } = await getSession();
  if (!userId) return NextResponse.json({ error: "Login required", code: "LOGIN_REQUIRED" }, { status: 401 });
  const body = await request.json().catch(() => null) as { relationshipId?: string; kind?: PassKind } | null;
  if (!body?.relationshipId || !body.kind || !(body.kind in PASS_PLAN_BY_KIND))
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const supabase = getServiceSupabase();
  const { data: rel } = await supabase.from("relationships").select("id, user_id").eq("id", body.relationshipId).maybeSingle();
  if (!rel || rel.user_id !== userId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const res = await purchasePass(userId, rel.id, body.kind);
  if (!res.success) {
    const code = res.reason === "insufficient" ? "INSUFFICIENT_STARS" : "PURCHASE_FAILED";
    return NextResponse.json({ error: code, reason: res.reason, balance: res.balance }, { status: res.reason === "insufficient" ? 402 : 500 });
  }
  return NextResponse.json({ success: true, balance: res.balance, expiresAt: res.expiresAt });
}
