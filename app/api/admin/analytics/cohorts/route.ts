// app/api/admin/analytics/cohorts/route.ts — 가입 주차 코호트 LTV/리텐션 (최근 12주).
//
// 집계는 Postgres RPC 가 한다 — 원본 행을 앱으로 끌어오지 않는다. 이전 구현은 users →
// payments·readings 를 `.in(userIds)` 로 3쿼리 끌어와 앱에서 집계했는데, Supabase
// `Max rows`(서버 강제 상한)가 `.limit(100000)` 을 조용히 덮어써 잘린다(2026-07-28 사고:
// /admin/traffic UV 53% 유실 · /admin/paywall 완료율 21% 표시, 실제 63.7%).
// RPC 는 반환 행수가 주차 수(=12)로 고정되므로 cap 개념 자체가 소멸하고, 수백 개 UUID 를
// URL 에 밀어넣던 `.in(userIds)` 2단계도 사라진다.
//
// ⚠️ 코호트 규칙 2개는 **비표준이고 의도된 것**이다 (RPC 가 그대로 재현한다):
//   ① 주차 인덱스는 코호트 주 시작이 아니라 **개인 가입 시각 기준** floor(경과일/7)
//      → 같은 코호트 안에서 유저별 오프셋이 다르다.
//   ② d1/d7/d30 은 "가입 후 N일 **이후** 활동" **누적** 정의(≥, 윈도우 아님) → d1 ⊇ d7 ⊇ d30.
//   교과서 정의로 "고치지" 말 것.
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { adminExclusionArray } from "@/lib/admin";
import { daysAgoKstIso } from "@/lib/admin-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEKS = 12;

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const since = daysAgoKstIso(WEEKS * 7 - 1);
  const supa = getServiceSupabase();

  // 어드민 활동 제외 — 코호트에서 빠지면 하위 payments/activity 도 자동 제외
  const { data, error } = await supa.rpc("admin_cohorts", {
    p_since: since,
    p_exclude: adminExclusionArray(),
    p_weeks: WEEKS, // 히트맵이 그리는 열 수(W0~W11)와 배열 길이를 같은 상수로 맞춘다
  });
  if (error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  // RPC 는 snake_case 컬럼을 준다 → 화면 타입(camelCase)으로 옮긴다.
  // BIGINT/NUMERIC 은 PostgREST 를 지나며 문자열이 되므로 전부 Number() 로 감싼다
  // (cum_revenue_per_user 는 BIGINT 배열이라 원소마다 감싼다).
  const cohorts = (
    (data ?? []) as {
      week_start: string;
      cohort_size: number;
      cum_revenue_per_user: number[] | null;
      d1: number;
      d7: number;
      d30: number;
    }[]
  ).map((r) => ({
    weekStart: r.week_start,
    cohortSize: Number(r.cohort_size),
    cumRevenuePerUser: (r.cum_revenue_per_user ?? []).map(Number),
    retention: { d1: Number(r.d1), d7: Number(r.d7), d30: Number(r.d30) },
  }));

  return NextResponse.json({ weeks: WEEKS, cohorts });
}
