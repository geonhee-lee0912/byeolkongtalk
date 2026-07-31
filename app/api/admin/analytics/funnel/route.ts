// app/api/admin/analytics/funnel/route.ts — 소재별 퍼널 + ad_spend 조인 CAC/ROAS.
//
// 집계는 Postgres RPC 가 한다 — 원본 행을 앱으로 끌어오지 않는다. 이전 구현은
// user_acquisition·users·readings·payments·ad_spend 를 `.limit(100000)` 으로 5번 끌어와 앱에서
// 집계했는데, Supabase `Max rows`(서버 강제 상한)가 그 limit 을 조용히 덮어써 잘린다
// (2026-07-28 사고: /admin/traffic UV 53% 유실 · /admin/paywall 완료율 21% 표시, 실제 63.7%).
// 수백~수천 개 UUID 를 `.in("user_id", …)` 로 URL 에 싣던 2단 조회도 사라진다 — URL 길이 한계 해소.
//
// 모집단·날짜 규칙은 RPC(admin_funnel) 안에 있고 현행 buildFunnel 과 값이 같다:
// 추적 갈래는 users.created_at 을 보지 않고(창 전 가입 + 창 안 acquisition 도 포함),
// readings·payments 는 날짜 필터가 없고(평생), ad_spend 는 어드민 제외를 걸지 않으며,
// '(organic)' 은 지출 귀속이 불가능하므로 지출·CAC·ROAS 가 강제 NULL 이다. "개선"하지 말 것.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { adminExclusionArray } from "@/lib/admin";
import { daysAgoKstIso } from "@/lib/admin-time";
import { CREATIVE_ALIASES } from "@/lib/analytics/creative-alias";
import type { FunnelRow } from "@/lib/analytics/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RPC 결과도 PostgREST 를 지나므로 `Max rows` cap 이 그대로 적용된다. 반환 행수가 소재
// 카디널리티 비례라 상한을 명시하고, 상한에 닿으면 아래에서 truncated 로 드러낸다 —
// 조용히 잘리는 것이 2026-07-28 cap 사고의 본질이었다.
const CREATIVE_LIMIT = 200;

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 30)));
  const since = daysAgoKstIso(days - 1);
  const supa = getServiceSupabase();

  // 별칭 맵의 단일 원천은 앱에 남긴다 — canonicalCreative 와 같은 맵을 JSONB 로 넘겨
  // SQL 의 admin_canonical_creative 가 동일하게 병합하게 한다(맵을 SQL 에 복사하면 드리프트).
  const { data, error } = await supa.rpc("admin_funnel", {
    p_since: since,
    p_exclude: adminExclusionArray(),
    p_aliases: CREATIVE_ALIASES,
    p_limit: CREATIVE_LIMIT,
  });
  if (error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  // RPC 는 snake_case 컬럼을 준다 → 화면 타입(camelCase)으로 옮긴다.
  // BIGINT/NUMERIC 은 PostgREST 를 지나며 문자열이 되므로 Number() 로 감싼다.
  // 🔴 spend_won·cac·roas 는 '(organic)' 과 지출 미등록 소재에서 **정당하게 NULL** 이다.
  //    Number(null) === 0 이라 무조건 감싸면 "귀속 불가"가 "지출 0"(=CAC 0·ROAS 0)으로 조용히
  //    바뀌어 광고 판단을 뒤집는다 → null 은 null 로 보존한다.
  const rows: FunnelRow[] = (
    (data ?? []) as {
      creative: string;
      signups: number;
      tried: number;
      first_paid: number;
      repaid: number;
      signup_to_paid_pct: number | null;
      revenue_won: number;
      spend_won: number | null;
      cac: number | null;
      roas: number | null;
    }[]
  ).map((r) => ({
    creative: r.creative,
    signups: Number(r.signups),
    tried: Number(r.tried),
    firstPaid: Number(r.first_paid),
    repaid: Number(r.repaid),
    // 여기만 NULL→0 이다. 그룹은 유저가 최소 1명일 때만 생기므로 signups=0 은 실제로 안 나오고,
    // SQL 의 nullif(signups,0) 방어가 NULL 을 내는 경우는 buildFunnel 의 `signups ? … : 0` 과
    // 같은 자리다 — 비율 0 이 맞는 값이다(지출과 달리 "귀속 불가"가 아니다).
    signupToPaidPct: Number(r.signup_to_paid_pct ?? 0),
    revenueWon: Number(r.revenue_won),
    spendWon: r.spend_won === null ? null : Number(r.spend_won),
    cac: r.cac === null ? null : Number(r.cac),
    roas: r.roas === null ? null : Number(r.roas),
  }));

  return NextResponse.json({
    days,
    rows,
    // 기존 필드는 건드리지 않고 추가만 한다(화면 무수정 계약). 상한 도달 = 표가 전부를 보여주지
    // 못한다는 뜻이라 응답에 남긴다 — 화면은 아직 읽지 않지만 조용히 삼키지는 않는다.
    truncated: rows.length >= CREATIVE_LIMIT,
  });
}
