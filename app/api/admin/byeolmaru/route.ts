// app/api/admin/byeolmaru/route.ts — 별마루 계측 요약·추세·D1~D7 재방문 RPC 호출.
// 집계는 전부 admin_byeolmaru_* RPC(supabase/migrations/20260904000000_..)가 한다 —
// 원본 행을 앱으로 끌어오지 않는다(traffic/errors/users 라우트와 동일 관행).
//
// 페이지(app/admin/free/byeolmaru/page.tsx)가 이 라우트를 서버사이드에서 셀프 호출한다.
// 페이지는 app/admin/layout.tsx(어드민 화이트리스트 가드)로 보호되지만, 이 라우트 자체는
// app/api/* 라 그 레이아웃 가드가 안 걸린다 — 그래서 아래 requireAdmin 을 독립적으로 또 건다
// (AGENTS.md: "데이터는 /api/admin/* 개별 requireAdmin 으로 이중 보호").
//
// 블록별로 error 플래그를 따로 실어 보낸다(전체 500 한 방이 아니라) — retention 은 특히
// "RPC 가 실패했다"와 "RPC 는 성공했는데 행이 0개(아직 관측창이 안 찼다)"를 구분해야 해서다.
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { adminExclusionArray } from "@/lib/admin";
import { daysAgoKstIso } from "@/lib/admin-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const supa = getServiceSupabase();
  const p_exclude = adminExclusionArray();
  const p_since = daysAgoKstIso(29); // 최근 30일(오늘 포함) — 다른 어드민 추세표와 동일 창

  const [summaryRes, trendRes, retentionRes, watchSummaryRes, watchDistRes] = await Promise.all([
    supa.rpc("admin_byeolmaru_summary", { p_exclude }),
    supa.rpc("admin_byeolmaru_trend", { p_since, p_exclude }),
    supa.rpc("admin_byeolmaru_retention", { p_exclude }),
    supa.rpc("admin_byeolmaru_watch_summary", { p_exclude }),
    supa.rpc("admin_byeolmaru_watch_distribution", { p_exclude }),
  ]);

  return NextResponse.json({
    summary: summaryRes.data?.[0] ?? null,
    summaryError: !!summaryRes.error,
    trend: trendRes.data ?? [],
    trendError: !!trendRes.error,
    // retention 이 빈 배열인 건 정상 케이스다(오늘 막 생긴 코호트는 D1~D7 이 전부 미성숙이라
    // RPC 가 행 자체를 안 준다) — 페이지가 이 배열 길이와 retentionError 를 따로 보고 판단한다.
    retention: retentionRes.data ?? [],
    retentionError: !!retentionRes.error,
    watchSummary: watchSummaryRes.data?.[0] ?? null,
    watchSummaryError: !!watchSummaryRes.error,
    watchDist: watchDistRes.data ?? [],
    watchDistError: !!watchDistRes.error,
  });
}
