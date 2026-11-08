// app/api/admin/push/route.ts — 앱 알림 성과 집계 RPC 호출(admin_push_*, 20261108020000).
// 집계는 전부 SQL 이 한다 — 원본 행을 앱으로 끌어오지 않는다(AGENTS.md '어드민 집계').
// 페이지(app/admin/push/page.tsx)가 서버사이드에서 셀프 호출한다. app/api/* 는 어드민 레이아웃 가드가 안 걸려 requireAdmin 을 따로 건다.
// 블록별 error 플래그 — 한 RPC 가 죽어도 나머지는 보인다.
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { adminExclusionArray } from "@/lib/admin";
import { daysAgoKstIso } from "@/lib/admin-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 묻기·동의·발송·예약이 공유하는 창(오늘 포함 30일). 요약만 '지금 상태'다 — 화면이 그렇게 라벨한다 */
export const PUSH_WINDOW_DAYS = 30;

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const supa = getServiceSupabase();
  const p_exclude = adminExclusionArray();
  const p_since = daysAgoKstIso(PUSH_WINDOW_DAYS - 1);

  const [summary, asks, consent, sends, revisit] = await Promise.all([
    supa.rpc("admin_push_summary", { p_exclude }),
    supa.rpc("admin_push_asks", { p_since, p_exclude }),
    supa.rpc("admin_push_consent", { p_since, p_exclude }),
    supa.rpc("admin_push_sends_daily", { p_since, p_exclude }),
    supa.rpc("admin_push_revisit", { p_since, p_exclude }),
  ]);

  return NextResponse.json({
    windowDays: PUSH_WINDOW_DAYS,
    summary: summary.data?.[0] ?? null,
    summaryError: !!summary.error,
    asks: asks.data ?? [],
    asksError: !!asks.error,
    consent: consent.data ?? [],
    consentError: !!consent.error,
    sends: sends.data ?? [],
    sendsError: !!sends.error,
    revisit: revisit.data ?? [],
    revisitError: !!revisit.error,
  });
}
