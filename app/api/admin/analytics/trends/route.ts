// app/api/admin/analytics/trends/route.ts — 일별 가입/리딩/매출 추세.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { adminExclusionList } from "@/lib/admin";
import { daysAgoKstIso, startOfTodayKstIso } from "@/lib/admin-time";
import { buildTrends } from "@/lib/analytics/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 30)));
  const since = daysAgoKstIso(days - 1);
  // startOfTodayKstIso()는 KST 오늘 0시의 UTC ISO → +9h 후 슬라이스하면 KST 날짜.
  const todayKst = new Date(new Date(startOfTodayKstIso()).getTime() + 9 * 3600000)
    .toISOString()
    .slice(0, 10);
  const supa = getServiceSupabase();

  // 어드민(운영자) 활동 제외 — 테스트 결제/리딩 지표 오염 방지
  const excl = adminExclusionList();
  let usersQ = supa.from("users").select("created_at").gte("created_at", since).limit(100000);
  let readingsQ = supa.from("readings").select("created_at").gte("created_at", since).limit(100000);
  let paymentsQ = supa.from("payments").select("created_at, amount_won, status").eq("status", "completed").gte("created_at", since).limit(100000);
  if (excl) {
    usersQ = usersQ.not("id", "in", excl);
    readingsQ = readingsQ.not("user_id", "in", excl);
    paymentsQ = paymentsQ.not("user_id", "in", excl);
  }
  const [{ data: users }, { data: readings }, { data: payments }] = await Promise.all([
    usersQ,
    readingsQ,
    paymentsQ,
  ]);

  return NextResponse.json({
    days,
    points: buildTrends({
      users: users ?? [],
      readings: readings ?? [],
      payments: payments ?? [],
      days,
      todayKst,
    }),
  });
}
