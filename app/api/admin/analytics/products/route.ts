// app/api/admin/analytics/products/route.ts — 상품별 집계(고민톡/운세/별구매/연애 패스).
//
// 상담·운세·패키지·패스 집계는 Postgres RPC 가 한다 — 원본 행을 앱으로 끌어오지 않는다.
// 이전 구현은 readings·payments·relationship_passes 를 `.limit(100000)` 으로 받아 앱에서 집계했는데,
// Supabase `Max rows`(서버 강제 상한)가 그 limit 을 조용히 덮어써 잘린다 — PostgREST 는
// 200 + Content-Range 로 응답하고 supabase-js 는 에러로 승격하지 않는다(2026-07-28 사고:
// /admin/traffic UV 53% 유실 · /admin/paywall 완료율 21% 표시, 실제 63.7%).
// 어드민 제외 · KST 자정 · 운세 센티넬 판정은 모두 RPC 안에 있다.
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-actions";
import { adminExclusionArray, adminExclusionList } from "@/lib/admin";
import { daysAgoKstIso } from "@/lib/admin-time";
import { FORTUNE_CONFIG } from "@/lib/fortune/types";
import {
  buildStarSpendBreakdown,
  type CounselGroup,
  type FortuneGroup,
  type PackageGroup,
  type StarTxRow,
  type ReadingInfo,
} from "@/lib/analytics/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 30)));
  const since = daysAgoKstIso(days - 1);
  const supa = getServiceSupabase();

  // 어드민(운영자) 활동 제외 — 테스트 결제/리딩 지표 오염 방지
  const p_exclude = adminExclusionArray();
  // counsel 갈래는 (상담종류 × emotion_tag) 카디널리티에 비례한다 — emotion_tag 가 자유 문자열이라
  // 상한이 없다. RPC 결과도 PostgREST 를 지나므로 cap 이 재발할 수 있어 상한을 명시하고, 닿으면
  // 아래 truncated 로 드러낸다 — 조용히 잘리는 것이 2026-07-28 cap 사고의 본질이었다.
  const PRODUCT_LIMIT = 200;

  const [pb, pass] = await Promise.all([
    supa.rpc("admin_product_breakdown", {
      p_since: since,
      p_exclude,
      // 유효 운세 타입의 단일 원천은 앱에 둔다 — SQL 에서 like 'fortune:%' 만 쓰면 'fortune:오타' 를
      // 앱(fortuneTypeFromTag)은 상담으로, SQL 은 운세로 분류해 조용히 어긋난다. 하드코딩하면
      // FORTUNE_CONFIG 에 타입이 추가될 때 드리프트하므로 키를 런타임에 뽑는다.
      p_fortune_types: Object.keys(FORTUNE_CONFIG),
      p_limit: PRODUCT_LIMIT,
    }),
    supa.rpc("admin_pass_breakdown", { p_since: since, p_exclude }),
  ]);
  if (pb.error || pass.error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  // RPC 는 세 kind 를 한 결과셋에 담아 주므로 화면 계약대로 세 배열로 되돌린다.
  // 자기 kind 가 안 쓰는 컬럼은 NULL 이라 각 kind 가 선언한 필드만 옮긴다(NULL 을 0 으로
  // 옮겨 담으면 packages 에 없던 별·유료 열이 생겨 계약이 바뀐다).
  // BIGINT 는 PostgREST 를 지나며 문자열이 되므로 실수치는 Number() 로 감싼다.
  type PbRow = {
    kind: string;
    key1: string;
    key2: string | null;
    cnt: number;
    paid_cnt: number | null;
    stars: number | null;
    revenue_won: number | null;
  };
  const pbRows = (pb.data ?? []) as PbRow[];
  // 정렬은 앱이 유지한다 — UNION ALL 은 하위 쿼리의 ORDER BY 를 보존하지 않는다.
  const counsel: CounselGroup[] = pbRows
    .filter((r) => r.kind === "counsel")
    .map((r) => ({
      emotionTag: r.key2 ?? "(없음)",
      consultationType: r.key1 as "saju" | "tarot",
      count: Number(r.cnt),
      paidCount: Number(r.paid_cnt ?? 0),
      starsSpent: Number(r.stars ?? 0),
    }))
    .sort((a, b) => b.count - a.count);
  const fortune: FortuneGroup[] = pbRows
    .filter((r) => r.kind === "fortune")
    .map((r) => ({
      kind: r.key1,
      count: Number(r.cnt),
      paidCount: Number(r.paid_cnt ?? 0),
      starsSpent: Number(r.stars ?? 0),
    }))
    .sort((a, b) => b.count - a.count);
  const packages: PackageGroup[] = pbRows
    .filter((r) => r.kind === "package")
    .map((r) => ({
      packageType: r.key1,
      count: Number(r.cnt),
      revenueWon: Number(r.revenue_won ?? 0),
    }))
    .sort((a, b) => b.revenueWon - a.revenueWon);

  // 연애 상담 패스 — 종류(1/3/7일권)별 구매 건수·별·유니크 (kind 는 relationship_passes 가 권위)
  const relPasses = (
    (pass.data ?? []) as { pass_kind: string; cnt: number; stars: number; buyers: number }[]
  ).map((r) => ({
    kind: r.pass_kind,
    count: Number(r.cnt),
    stars: Number(r.stars),
    users: Number(r.buyers),
  }));

  // ⚠️ 아래 별 소모 집계(star_transactions + readings 조인)는 아직 원본 행을 받는다.
  // buildStarSpendBreakdown 의 15단 우선순위 사다리를 SQL 로 옮기는 작업(종류 C)이 남아 있어서다.
  // 계획: docs/superpowers/plans/2026-07-30-admin-rpc-d-typec-and-bugs.md
  // 30일 star_transactions 는 Supabase `Max rows` 에 걸릴 수 있다 — 그때까지 cap 을 낮추지 말 것.
  const excl = adminExclusionList();
  let txQ = supa
    .from("star_transactions")
    .select("user_id, type, amount, source, reading_id, created_at")
    .eq("type", "spend")
    .gte("created_at", since)
    .limit(100000);
  if (excl) txQ = txQ.not("user_id", "in", excl);
  const { data: tx } = await txQ;
  const rids = [...new Set((tx ?? []).map((t) => t.reading_id).filter(Boolean))] as string[];
  const readingsById = new Map<string, ReadingInfo>();
  if (rids.length) {
    const { data: rinfo } = await supa
      .from("readings")
      .select("id, consultation_type, emotion_tag, relationship_id, skill_key")
      .in("id", rids);
    for (const r of rinfo ?? [])
      readingsById.set(r.id, {
        consultation_type: r.consultation_type,
        emotion_tag: r.emotion_tag,
        relationship_id: r.relationship_id,
        skill_key: r.skill_key,
      });
  }
  const starSpend = buildStarSpendBreakdown((tx ?? []) as StarTxRow[], readingsById);

  return NextResponse.json({
    days,
    counsel,
    fortune,
    packages,
    starSpend,
    relPasses,
    // 상한 도달 = 표가 전부를 보여주지 못한다는 뜻. 화면 계약을 깨지 않는 추가 필드다.
    truncated: counsel.length >= PRODUCT_LIMIT || packages.length >= PRODUCT_LIMIT,
  });
}
