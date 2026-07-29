// app/api/admin/traffic/route.ts — page_views 기반 UV/PV.
// 지표 5개: 일별 추세 / 방문자 구성 / 라우트별 / 로그인 전후 / 유입별. 봇 비율은 계측 건강성 한 줄.
//
// 집계는 전부 Postgres RPC 가 한다 — 원본 행을 앱으로 끌어오지 않는다. 이전 구현은 page_views
// 원본을 .limit(100000) 으로 받아 앱에서 집계했는데, Supabase `Max rows`(서버 강제 상한)가
// 그 limit 을 조용히 덮어써 30일 UV/PV 가 53% 유실됐다(2026-07-28 사고).
// 봇 제외 · 어드민 제외(3값 논리) · 오전 10시 롤오버 · first-touch 귀속 규칙은 모두 RPC 안에 있다.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { adminExclusionArray } from "@/lib/admin";
import { adminDaysAgoKstIso, adminKstDate } from "@/lib/admin-time";
import {
  buildVisitorMix,
  fillTrafficAxis,
  withPvPerUv,
  type TrafficPoint,
  type VisitorMixRow,
} from "@/lib/analytics/traffic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 30)));
  const since = adminDaysAgoKstIso(days - 1);
  const todayBucket = adminKstDate(new Date().toISOString());
  const supa = getServiceSupabase();
  const p_exclude = adminExclusionArray();
  // 유입 RPC 는 반환 행수가 소재 카디널리티 비례라 상한을 명시한다. 상한에 닿으면 아래에서
  // truncated 플래그로 드러낸다 — 조용히 잘리는 것이 2026-07-28 cap 사고의 본질이었다.
  const ENTRY_LIMIT = 200;

  const [trend, mix, routes, auth, variants, contents, bot] = await Promise.all([
    supa.rpc("admin_traffic_trend", { p_since: since, p_exclude }),
    supa.rpc("admin_traffic_visitor_mix", { p_since: since, p_exclude }),
    supa.rpc("admin_traffic_routes", { p_since: since, p_exclude, p_today: todayBucket }),
    supa.rpc("admin_traffic_auth", { p_since: since, p_exclude, p_today: todayBucket }),
    supa.rpc("admin_traffic_entry", {
      p_since: since,
      p_exclude,
      p_field: "landing_variant",
      p_limit: ENTRY_LIMIT,
    }),
    supa.rpc("admin_traffic_entry", {
      p_since: since,
      p_exclude,
      p_field: "utm_content",
      p_limit: ENTRY_LIMIT,
    }),
    supa.rpc("admin_traffic_bot", { p_since: since, p_exclude }),
  ]);

  const failed = [trend, mix, routes, auth, variants, contents, bot].find((r) => r.error);
  if (failed) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  // RPC 는 snake_case 컬럼을 준다 → 화면 타입(camelCase)으로 옮긴다.
  const trendRows: TrafficPoint[] = (
    (trend.data ?? []) as { bucket: string; uv: number; pv: number }[]
  ).map((r) => ({ date: r.bucket, uv: Number(r.uv), pv: Number(r.pv) }));

  const mixRows: VisitorMixRow[] = (
    (mix.data ?? []) as {
      bucket: string;
      uv: number;
      new_uv: number;
      streak_uv: number;
      back_uv: number;
    }[]
  ).map((r) => ({
    date: r.bucket,
    uv: Number(r.uv),
    newUv: Number(r.new_uv),
    streakUv: Number(r.streak_uv),
    backUv: Number(r.back_uv),
  }));

  // routes·auth 는 같은 (uv, pv, today_uv, today_pv) 4컬럼을 주고 식별 컬럼만 다르다.
  // 계산된 키(`[key]: r[key]`)로 일반화하면 TS 가 필드명을 좁히지 못해 타입 에러가 나므로,
  // 숫자 4개만 공통 처리하고 식별 컬럼은 호출부에서 명시한다.
  type CountRow = { uv: number; pv: number; today_uv: number; today_pv: number };
  const counts = (r: CountRow) => ({
    uv: Number(r.uv),
    pv: Number(r.pv),
    todayUv: Number(r.today_uv),
    todayPv: Number(r.today_pv),
  });
  const routeRows = ((routes.data ?? []) as (CountRow & { path: string })[]).map((r) => ({
    path: r.path,
    ...counts(r),
  }));
  const authRows = ((auth.data ?? []) as (CountRow & { segment: string })[]).map((r) => ({
    segment: r.segment,
    ...counts(r),
  }));

  // 유입표에는 "오늘" 열이 없다 — 30일 first-touch 키를 그대로 쓸지(오늘 움직인 사람의 출신)
  // 오늘 행만으로 다시 귀속할지(오늘 광고 타고 온 사람)에 따라 값이 갈리는데, 후자는 광고
  // 유입자가 오가닉으로 재방문할수록 (직접/오가닉)을 부풀려 오독을 만든다. 애매한 지표를
  // 남기는 대신 열을 뺐다(2026-07-29 결정). 일일 광고 유입은 /admin/ads 와 Meta 가 본다.
  const entryRows = (rows: unknown) =>
    ((rows ?? []) as { key: string; uv: number; pv: number }[]).map((r) => ({
      key: r.key,
      uv: Number(r.uv),
      pv: Number(r.pv),
    }));

  const botRow = ((bot.data ?? []) as { total_pv: number; bot_pv: number }[])[0] ?? {
    total_pv: 0,
    bot_pv: 0,
  };
  const totalPv = Number(botRow.total_pv);
  const botPv = Number(botRow.bot_pv);

  return NextResponse.json({
    days,
    bot: { totalPv, botPv, botPct: totalPv ? Math.round((botPv / totalPv) * 1000) / 10 : 0 },
    trend: fillTrafficAxis(trendRows, days, todayBucket),
    // 방문자 구성은 축을 채우지 않는다 — 수집 전 날짜를 0 으로 채우면 "그날 방문자 0" 과
    // "그날은 아직 수집 전" 이 구분되지 않아 재방문율이 0 으로 희석된다.
    visitorMix: buildVisitorMix(mixRows),
    routes: withPvPerUv(routeRows),
    auth: authRows,
    entry: {
      variants: entryRows(variants.data),
      contents: entryRows(contents.data),
      // 상한 도달 = 표가 전부를 보여주지 못한다는 뜻. 화면이 이걸 한 줄로 알린다.
      truncated:
        (variants.data ?? []).length >= ENTRY_LIMIT || (contents.data ?? []).length >= ENTRY_LIMIT,
    },
  });
}
