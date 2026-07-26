// app/api/admin/traffic/route.ts — page_views 기반 UV/PV.
// 지표 4개: 일별 추세 / 라우트별 / 로그인 전후 / 유입별. 봇 비율은 계측 건강성 한 줄로 덧붙인다.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { adminExclusionList } from "@/lib/admin";
import { adminDaysAgoKstIso, adminKstDate } from "@/lib/admin-time";
import {
  buildTrafficTrend,
  buildBotShare,
  buildRouteRanking,
  buildAuthSplit,
  buildEntrySources,
  filterByBucket,
  mergeToday,
  type PageViewRow,
} from "@/lib/analytics/traffic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 30)));
  // 날짜 경계는 대시보드 KPI 와 같은 오전 10시 롤오버 — 밤사이 세션이 두 날짜로 쪼개지면
  // "그 세션이 어느 라우트에서 끊겼나" 가 반으로 잘려 보인다. (조회창 시작도 같은 기준이어야
  // 가장 오래된 버킷이 반쪽만 담기지 않는다)
  const since = adminDaysAgoKstIso(days - 1);
  const todayBucket = adminKstDate(new Date().toISOString());
  const supa = getServiceSupabase();

  // 어드민(운영자) 활동 제외 — 운영자가 화면 돌아다닌 PV 가 라우트 순위를 왜곡한다.
  // ⚠️ 다른 애널리틱스 라우트처럼 .not("user_id","in",excl) 만 쓰면 안 된다:
  //    page_views 는 비로그인 행의 user_id 가 NULL 이고 SQL 의 `NULL NOT IN (...)` 은 NULL(=거짓)이라
  //    비로그인 PV 가 전부 사라진다 — 이 화면이 보려는 것의 절반이 조용히 날아간다.
  //    그래서 "NULL 이거나(비로그인) 어드민이 아닌" 형태로 감싼다.
  // ⚠️ 한계: 어드민이 로그아웃 상태(user_id NULL)로 돌아다닌 PV 는 걸러지지 않는다.
  //    anon_id 만으로는 어드민 판별이 불가능하기 때문 (anon_id ↔ 어드민 매핑이 없다).
  //    표본이 작을 때 비로그인 UV/PV 를 볼 땐 이 오염을 감안할 것.
  const excl = adminExclusionList();
  let q = supa
    .from("page_views")
    .select("anon_id, user_id, path, landing_variant, utm_content, is_bot, created_at")
    .gte("created_at", since)
    .limit(100000);
  if (excl) q = q.or(`user_id.is.null,user_id.not.in.${excl}`);
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
  const rows = (data ?? []) as PageViewRow[];
  // 표마다 기간 값 옆에 오늘 값을 나란히 세운다. 조회를 한 번 더 하지 않고 같은 배열을 버킷으로
  // 걸러 같은 집계 함수를 두 번 돌린다 — 두 열이 같은 정의(봇 제외·어드민 제외·10시 롤오버)를 공유해야
  // 비교가 성립한다. 오늘 집계는 limit 없이(Infinity) 뽑아야 기간 상위권의 오늘 값이 누락되지 않는다.
  const todayRows = filterByBucket(rows, todayBucket);
  const entryAll = buildEntrySources(rows);
  const entryToday = buildEntrySources(todayRows);

  return NextResponse.json({
    days,
    // 봇은 각 집계 함수가 내부에서 제외한다. bot 은 비율 표시용(같은 배열에서 계산).
    bot: buildBotShare(rows),
    trend: buildTrafficTrend({ rows, days, todayBucket }),
    routes: mergeToday(
      buildRouteRanking(rows),
      buildRouteRanking(todayRows, Infinity),
      (r) => r.path
    ),
    auth: mergeToday(buildAuthSplit(rows), buildAuthSplit(todayRows), (r) => r.segment),
    entry: {
      variants: mergeToday(entryAll.variants, entryToday.variants, (r) => r.key),
      contents: mergeToday(entryAll.contents, entryToday.contents, (r) => r.key),
    },
  });
}
