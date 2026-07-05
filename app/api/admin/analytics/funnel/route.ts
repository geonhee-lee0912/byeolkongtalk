// app/api/admin/analytics/funnel/route.ts — 소재별 퍼널 + ad_spend 조인 CAC/ROAS.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { daysAgoKstIso } from "@/lib/admin-time";
import { buildFunnel } from "@/lib/analytics/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 30)));
  const since = daysAgoKstIso(days - 1);
  const supa = getServiceSupabase();

  // 선택 기간에 '가입'한 유저를 코호트로 (user_acquisition 은 users 와 1:1, created_at 동일 시점)
  const { data: acqs } = await supa
    .from("user_acquisition")
    .select("user_id, utm_content, created_at")
    .gte("created_at", since)
    .limit(100000);

  const userIds = (acqs ?? []).map((a) => a.user_id);
  const [{ data: readings }, { data: payments }, { data: spend }] = await Promise.all([
    userIds.length
      ? supa.from("readings").select("user_id").in("user_id", userIds).limit(100000)
      : Promise.resolve({ data: [] as { user_id: string }[] }),
    userIds.length
      ? supa.from("payments").select("user_id, status, amount_won").in("user_id", userIds).limit(100000)
      : Promise.resolve({ data: [] as { user_id: string; status: string | null; amount_won: number | null }[] }),
    supa.from("ad_spend").select("creative_key, spend_won").gte("spend_date", since.slice(0, 10)).limit(100000),
  ]);

  return NextResponse.json({
    days,
    rows: buildFunnel({
      acquisitions: (acqs ?? []).map((a) => ({ user_id: a.user_id, utm_content: a.utm_content })),
      readings: readings ?? [],
      payments: payments ?? [],
      spend: spend ?? [],
    }),
  });
}
