// app/api/admin/stats/route.ts — 대시보드 KPI (오늘/주간).
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { startOfTodayKstIso, daysAgoKstIso } from "@/lib/admin-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const supa = getServiceSupabase();
  const today = startOfTodayKstIso();
  const week = daysAgoKstIso(6);
  const c = (q: string, since: string) =>
    supa.from(q).select("id", { count: "exact", head: true }).gte("created_at", since);

  const [
    todayUsers, weekUsers, todayReadings, weekReadings,
    todayPay, weekPay, unresolvedErrors, unreviewedSensitive,
  ] = await Promise.all([
    c("users", today), c("users", week),
    c("readings", today), c("readings", week),
    // 기본 1000행 cap 회피 (운영 규모 커지면 SUM RPC 로 전환)
    supa.from("payments").select("amount_won").eq("status", "completed").gte("created_at", today).limit(100000),
    // 기본 1000행 cap 회피 (운영 규모 커지면 SUM RPC 로 전환)
    supa.from("payments").select("amount_won").eq("status", "completed").gte("created_at", week).limit(100000),
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
