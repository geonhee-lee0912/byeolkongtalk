// lib/analytics/aggregate.ts — 어드민 집계의 화면용 타입 + RPC 행 후처리.
//
// ⚠️ 2026-07-31: 앱에서 집계를 하던 순수 함수 7개(buildProductBreakdown·buildTrends·buildFunnel·
//    buildCohorts·buildStarSpendBreakdown·attributeFreeSpend·buildRelationshipFlow)와 그 전용
//    헬퍼·타입을 삭제했다. 집계가 전부 Postgres RPC(admin_analytics_*·admin_cohorts·
//    admin_star_spend_*·admin_relationship_*)로 넘어가 **프로덕션 호출처가 0** 이었는데 테스트만
//    남아 "전부 통과"가 거짓 안심을 주고 있었다 — 요청 경로에 없는 코드를 검증하던 것이다.
//    (같은 날 lib/analytics/traffic.ts 도 같은 이유로 정리했다.)
//    집계 규칙의 회귀 감지는 이제 마이그레이션의 RPC 정의와 scripts/admin-expected-values.sql
//    정답지 대조가 담당한다.
//
// 아래 타입들은 **RPC 결과를 매핑하는 라우트가 import 해서** 라우트↔화면 계약을 컴파일러로
// 강제한다. 호출처를 타입마다 적어 뒀으니 "아무도 안 쓰는 타입" 으로 보고 지우지 말 것.

// ── /api/admin/analytics/products (admin_product_breakdown) ──────────────────

export type CounselGroup = {
  emotionTag: string;
  consultationType: "saju" | "tarot";
  count: number;
  paidCount: number;
  starsSpent: number;
};
export type FortuneGroup = {
  kind: string;
  count: number;
  paidCount: number;
  starsSpent: number;
};
export type PackageGroup = {
  packageType: string;
  count: number;
  revenueWon: number;
};

// ── /api/admin/analytics/trends (admin_analytics_trend) ──────────────────────

export type TrendPoint = { date: string; newUsers: number; readings: number; revenueWon: number };

/**
 * RPC(admin_analytics_trend) 의 일별 행에 날짜 축을 채운다(없는 날 0). 축 밖 날짜는 버린다.
 * RPC 는 데이터가 있는 날만 반환하므로, 수집이 끊긴 날이 행째로 사라지면 그래프가 거짓말을 한다.
 *
 * ⚠️ `lib/analytics/traffic.ts` 의 `fillTrafficAxis` 와 **같은 알고리즘의 쌍둥이**다(포인트 타입만
 *    다르다). 한쪽의 축 의미론을 바꾸면(예: 축 밖 날짜를 버리는 대신 클램프) 두 그래프가 조용히
 *    갈린다 — 반드시 양쪽을 함께 고칠 것.
 */
export function fillTrendAxis(rows: TrendPoint[], days: number, todayKst: string): TrendPoint[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const base = new Date(`${todayKst}T00:00:00Z`);
  const out: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 86400000).toISOString().slice(0, 10);
    const hit = byDate.get(d);
    out.push({
      date: d,
      newUsers: hit?.newUsers ?? 0,
      readings: hit?.readings ?? 0,
      revenueWon: hit?.revenueWon ?? 0,
    });
  }
  return out;
}

// ── /api/admin/analytics/funnel (admin_funnel) ───────────────────────────────

export type FunnelRow = {
  creative: string; // utm_content · '(organic)'(utm 빈 캡처) · '(추적 안 됨)'(acquisition 없음)
  signups: number;
  tried: number;
  firstPaid: number;
  repaid: number;
  signupToPaidPct: number; // 0~100, 소수 1자리
  revenueWon: number;
  spendWon: number | null;
  cac: number | null;
  roas: number | null;
};

// ── 별 소모 (admin_star_spend_*) — /api/admin/analytics/products · /admin ─────

export type StarSpendDomain = "saju" | "tarot" | "fortune" | "relationship" | "upsell";
export type StarSpendGroup = {
  domain: StarSpendDomain;
  product: string;
  count: number;
  stars: number;
  freeStars: number; // free-first 귀속 무료 별
  users: number;
};
