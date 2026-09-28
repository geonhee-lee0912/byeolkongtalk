// app/api/admin/byeolmaru/route.ts — 별마루 계측 RPC 호출.
// 집계는 전부 admin_byeolmaru_* RPC 가 한다(20260904000000 · 20260905010000 ·
// 20260927000000_admin_byeolmaru_v2) — 원본 행을 앱으로 끌어오지 않는다.
//
// 페이지(app/admin/free/byeolmaru/page.tsx)가 이 라우트를 서버사이드에서 셀프 호출한다.
// 페이지는 app/admin/layout.tsx(어드민 화이트리스트 가드)로 보호되지만, 이 라우트 자체는
// app/api/* 라 그 레이아웃 가드가 안 걸린다 — 그래서 아래 requireAdmin 을 독립적으로 또 건다
// (AGENTS.md: "데이터는 /api/admin/* 개별 requireAdmin 으로 이중 보호").
//
// 블록별로 error 플래그를 따로 실어 보낸다(전체 500 한 방이 아니라) — retention 은 특히
// "RPC 가 실패했다"와 "RPC 는 성공했는데 행이 0개(아직 관측창이 안 찼다)"를 구분해야 해서다.
//
// 🔴 **watch_summary · watch_distribution 은 더 이상 안 부른다**(2026-09-27). 그 RPC 가 세던
//    partner_selected · watch_limit · watch_purchase 는 2026-09-24 부터 **발화처가 0**이고
//    (상대 1명 고정 + 슬롯 과금 삭제), 분포표는 상대가 한 명이라 항상 "1명" 한 줄이다.
//    RPC 자체는 DB 에 남겨 뒀다 — 과거 데이터를 읽을 유일한 경로라 지우면 복구가 안 된다.
//    살아남은 우리 오늘 신호(watch_add · watch_status_set · subscribe_from_woori)는
//    admin_byeolmaru_engagement 가 창(30일)을 걸어 돌려준다.
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { adminExclusionArray } from "@/lib/admin";
import { daysAgoKstIso } from "@/lib/admin-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 추세·퍼널·열람·산출물이 공유하는 창. 누적 요약(summary)만 전 기간이다 — 화면이 그렇게 라벨한다. */
export const BYEOLMARU_WINDOW_DAYS = 30;

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const supa = getServiceSupabase();
  const p_exclude = adminExclusionArray();
  const p_since = daysAgoKstIso(BYEOLMARU_WINDOW_DAYS - 1); // 오늘 포함 30일 — 다른 어드민 추세표와 동일 창

  const [summaryRes, trendRes, retentionRes, funnelRes, engagementRes, outputRes] = await Promise.all([
    supa.rpc("admin_byeolmaru_summary", { p_exclude }),
    supa.rpc("admin_byeolmaru_trend", { p_since, p_exclude }),
    supa.rpc("admin_byeolmaru_retention", { p_exclude }),
    supa.rpc("admin_byeolmaru_funnel", { p_since, p_exclude }),
    supa.rpc("admin_byeolmaru_engagement", { p_since, p_exclude }),
    supa.rpc("admin_byeolmaru_output", { p_since, p_exclude }),
  ]);

  return NextResponse.json({
    windowDays: BYEOLMARU_WINDOW_DAYS,
    summary: summaryRes.data?.[0] ?? null,
    summaryError: !!summaryRes.error,
    trend: trendRes.data ?? [],
    trendError: !!trendRes.error,
    // retention 이 빈 배열인 건 정상 케이스다(오늘 막 생긴 코호트는 D1~D7 이 전부 미성숙이라
    // RPC 가 행 자체를 안 준다) — 페이지가 이 배열 길이와 retentionError 를 따로 보고 판단한다.
    retention: retentionRes.data ?? [],
    retentionError: !!retentionRes.error,
    funnel: funnelRes.data ?? [],
    funnelError: !!funnelRes.error,
    engagement: engagementRes.data ?? [],
    engagementError: !!engagementRes.error,
    output: outputRes.data ?? [],
    outputError: !!outputRes.error,
  });
}
