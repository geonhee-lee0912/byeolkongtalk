// app/api/admin/stats/route.ts — 대시보드 KPI (오늘/주간).
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { adminExclusionList } from "@/lib/admin";
import { startOfAdminTodayKstIso, daysAgoKstIso } from "@/lib/admin-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const supa = getServiceSupabase();
  const today = startOfAdminTodayKstIso(); // 오전 10시 롤오버 (밤샘 유입 짤림 방지)
  const week = daysAgoKstIso(6);
  // 어드민(운영자) 활동은 KPI 에서 제외 — 테스트 결제/리딩이 지표 오염 방지
  const excl = adminExclusionList();
  const c = (q: string, idCol: string, since: string) => {
    let query = supa.from(q).select("id", { count: "exact", head: true }).gte("created_at", since);
    if (excl) query = query.not(idCol, "in", excl);
    return query;
  };
  // 기본 1000행 cap 회피 (운영 규모 커지면 SUM RPC 로 전환)
  const pay = (since: string) => {
    let query = supa.from("payments").select("amount_won").eq("status", "completed").gte("created_at", since).limit(100000);
    if (excl) query = query.not("user_id", "in", excl);
    return query;
  };

  const [
    todayUsers, weekUsers, todayReadings, weekReadings,
    todayPay, weekPay, unresolvedErrors, unreviewedSensitive,
  ] = await Promise.all([
    c("users", "id", today), c("users", "id", week),
    c("readings", "user_id", today), c("readings", "user_id", week),
    pay(today),
    pay(week),
    supa.from("error_logs").select("id", { count: "exact", head: true }).is("resolved_at", null),
    supa.from("sensitive_alerts").select("id", { count: "exact", head: true }).is("reviewed_at", null),
  ]);

  const sum = (rows: { amount_won: number }[] | null) =>
    (rows ?? []).reduce((s, r) => s + (r.amount_won ?? 0), 0);

  return NextResponse.json({
    today: { newUsers: todayUsers.count ?? 0, readings: todayReadings.count ?? 0, revenueWon: sum(todayPay.data) },
    week: { newUsers: weekUsers.count ?? 0, readings: weekReadings.count ?? 0, revenueWon: sum(weekPay.data) },
    alerts: { unresolvedErrors: unresolvedErrors.count ?? 0, unreviewedSensitive: unreviewedSensitive.count ?? 0 },
  });
}
