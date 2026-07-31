// app/api/admin/analytics/trends/route.ts — 일별 가입/리딩/매출 추세.
//
// 집계는 Postgres RPC(admin_analytics_trend) 가 한다 — 원본 행을 앱으로 끌어오지 않는다.
// 이전 구현은 users·readings·payments 3개를 .limit(100000) 으로 받아 앱에서 버킷팅했는데,
// Supabase `Max rows`(서버 강제 상한)가 그 limit 을 조용히 덮어쓴다 — PostgREST 는 200 +
// Content-Range 로 응답하고 supabase-js 는 그것을 에러로 승격하지 않는다(2026-07-28 사고:
// /admin/traffic UV 53% 유실 · /admin/paywall 완료율 21% 표시, 실제 63.7%).
// 어드민 제외 · KST 자정 버킷 · status='completed' 필터는 전부 RPC 안에 있다:
// supabase/migrations/20260731010000_admin_analytics_aggregates.sql
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { adminExclusionArray } from "@/lib/admin";
import { daysAgoKstIso, kstDate } from "@/lib/admin-time";
import { fillTrendAxis, type TrendPoint } from "@/lib/analytics/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 30)));
  const since = daysAgoKstIso(days - 1);
  const todayKst = kstDate(new Date().toISOString());
  const supa = getServiceSupabase();

  // 어드민(운영자) 활동 제외 — 테스트 결제/리딩 지표 오염 방지. 빈 배열이면 SQL 의
  // `<> ALL('{}')` 가 true 로 자연 동작하므로 호출부에 분기가 필요 없다.
  const { data, error } = await supa.rpc("admin_analytics_trend", {
    p_since: since,
    p_exclude: adminExclusionArray(),
  });
  if (error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  // RPC 는 snake_case 컬럼을 주고 BIGINT 는 문자열로 온다 → camelCase + Number().
  const rows: TrendPoint[] = (
    (data ?? []) as { bucket: string; new_users: number; readings: number; revenue_won: number }[]
  ).map((r) => ({
    date: r.bucket,
    newUsers: Number(r.new_users),
    readings: Number(r.readings),
    revenueWon: Number(r.revenue_won),
  }));

  return NextResponse.json({ days, points: fillTrendAxis(rows, days, todayKst) });
}
