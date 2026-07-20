// app/admin/analytics/page.tsx — 추세 + 소재 퍼널 + 상품별 + 코호트.
import { headers } from "next/headers";
import { LineChart } from "@/components/admin/LineChart";
import { CohortHeatmap } from "@/components/admin/CohortHeatmap";

export const dynamic = "force-dynamic";

async function api(path: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const cookie = h.get("cookie") ?? "";
  const res = await fetch(`${proto}://${host}${path}`, {
    headers: { cookie },
    cache: "no-store",
  });
  return res.ok ? res.json() : null;
}

export default async function AnalyticsPage() {
  const days = 30;
  const [trends, funnel, products, cohorts] = await Promise.all([
    api(`/api/admin/analytics/trends?days=${days}`),
    api(`/api/admin/analytics/funnel?days=${days}`),
    api(`/api/admin/analytics/products?days=${days}`),
    api(`/api/admin/analytics/cohorts`),
  ]);
  const pts: { date: string; newUsers: number; readings: number; revenueWon: number }[] =
    trends?.points ?? [];

  return (
    <div className="space-y-10">
      <h1 className="text-xl font-bold">애널리틱스 <span className="text-white/40 text-sm">(최근 {days}일)</span></h1>

      <section>
        <h2 className="text-sm text-white/60 mb-3">추세</h2>
        <LineChart
          labels={pts.map((p) => p.date)}
          series={[
            { label: "가입", color: "#E8C26A", values: pts.map((p) => p.newUsers) },
            { label: "리딩", color: "#B8A8D8", values: pts.map((p) => p.readings) },
            { label: "매출(원)", color: "#9F8AD0", values: pts.map((p) => p.revenueWon) },
          ]}
        />
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">소재별 퍼널 · CAC · ROAS</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-white/50 text-left">
              <tr>
                <th className="py-1">소재</th><th>가입</th><th>체험</th><th>첫결제</th><th>재결제</th>
                <th>가입→결제%</th><th>지출</th><th>CAC</th><th>매출</th><th>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {(funnel?.rows ?? []).map((r: Record<string, number | string | null>) => (
                <tr key={String(r.creative)} className="border-t border-white/10">
                  <td className="py-1.5">{r.creative}</td>
                  <td>{r.signups}</td><td>{r.tried}</td><td>{r.firstPaid}</td><td>{r.repaid}</td>
                  <td>{r.signupToPaidPct}%</td>
                  <td>{r.spendWon == null ? "—" : Number(r.spendWon).toLocaleString()}</td>
                  <td>{r.cac == null ? "—" : Number(r.cac).toLocaleString()}</td>
                  <td>{Number(r.revenueWon).toLocaleString()}</td>
                  <td>{r.roas == null ? "—" : r.roas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-6">
        <ProductTable title="고민톡 — 고민 분류별" rows={(products?.counsel ?? []).map((c: { emotionTag: string; consultationType: string; count: number; paidCount: number }) => ({ k: `${c.consultationType}·${c.emotionTag}`, a: c.count, b: c.paidCount }))} colB="유료" />
        <ProductTable title="운세 리포트 — 종류별" rows={(products?.fortune ?? []).map((f: { kind: string; count: number; paidCount: number }) => ({ k: f.kind, a: f.count, b: f.paidCount }))} colB="유료" />
        <ProductTable title="별 구매 — 상품별" rows={(products?.packages ?? []).map((p: { packageType: string; count: number; revenueWon: number }) => ({ k: p.packageType, a: p.count, b: p.revenueWon }))} colB="매출(원)" />
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">별 소모 상품 <span className="text-white/40 text-xs">(종목 → 상품 · 건수 / 별 / 유니크)</span></h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(["saju", "tarot", "fortune", "relationship", "upsell"] as const).map((dom) => {
            const rows = ((products?.starSpend ?? []) as { domain: string; product: string; count: number; stars: number; users: number }[]).filter((g) => g.domain === dom);
            if (!rows.length) return null;
            const LABEL: Record<string, string> = { saju: "사주 대화", tarot: "타로 대화", fortune: "운세 리포트", relationship: "연애 상담", upsell: "인챗 업셀" };
            return (
              <div key={dom}>
                <h3 className="text-sm text-white/70 mb-2">{LABEL[dom]}</h3>
                <table className="w-full text-[12px]">
                  <thead className="text-white/40 text-left"><tr><th className="py-1">상품</th><th>건수</th><th>별</th><th>유니크</th></tr></thead>
                  <tbody>
                    {rows.map((g) => (
                      <tr key={g.product} className="border-t border-white/10">
                        <td className="py-1">{g.product}</td><td>{g.count}</td><td>{g.stars.toLocaleString()}</td><td>{g.users}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">코호트 LTV / 리텐션 (누적 결제액/인, 최근 {cohorts?.weeks ?? 12}주)</h2>
        <CohortHeatmap cohorts={cohorts?.cohorts ?? []} weeks={cohorts?.weeks ?? 12} />
      </section>
    </div>
  );
}

function ProductTable({ title, rows, colB }: { title: string; rows: { k: string; a: number; b: number }[]; colB: string }) {
  return (
    <div>
      <h3 className="text-sm text-white/70 mb-2">{title}</h3>
      <table className="w-full text-[12px]">
        <thead className="text-white/40 text-left"><tr><th className="py-1">항목</th><th>건수</th><th>{colB}</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} className="border-t border-white/10">
              <td className="py-1">{r.k}</td><td>{r.a}</td><td>{r.b.toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={3} className="py-2 text-white/30">데이터 없음</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
