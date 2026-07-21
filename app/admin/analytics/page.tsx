// app/admin/analytics/page.tsx — 추세 + 소재 퍼널 + 상품별 + 코호트.
import { headers } from "next/headers";
import { LineChart } from "@/components/admin/LineChart";
import { CohortHeatmap } from "@/components/admin/CohortHeatmap";
import { FORTUNE_CONFIG } from "@/lib/fortune/types";

const REL_SKILL_LABEL: Record<string, string> = { checkin: "관계 체크인", deep_feelings: "걔 속마음", compat: "우리 궁합", verdict: "싸움 판정" };

function productLabel(domain: string, product: string): string {
  if (domain === "fortune")
    return (FORTUNE_CONFIG as Record<string, { label: string }>)[product]?.label ?? product;
  if (domain === "relationship" && product.startsWith("스킬:")) {
    const key = product.slice("스킬:".length);
    return `스킬 · ${REL_SKILL_LABEL[key] ?? key}`;
  }
  return product;
}

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

      <section>
        <h2 className="text-sm text-white/60 mb-3">
          상품별{" "}
          <span className="text-white/40 text-xs">
            (유니크 = 기간 내 그 상품에 별을 쓴 유저 수, 중복 제거 · 건수 = 무료 포함 전체 리딩)
          </span>
        </h2>
        <StarProductGrid products={products} />
      </section>

      <section className="max-w-md">
        <ProductTable title="별 구매 — 상품별" rows={(products?.packages ?? []).map((p: { packageType: string; count: number; revenueWon: number }) => ({ k: p.packageType, a: p.count, b: p.revenueWon }))} colB="매출(원)" />
      </section>

      <section>
        <h2 className="text-sm text-white/60 mb-3">코호트 LTV / 리텐션 (누적 결제액/인, 최근 {cohorts?.weeks ?? 12}주)</h2>
        <CohortHeatmap cohorts={cohorts?.cohorts ?? []} weeks={cohorts?.weeks ?? 12} />
      </section>
    </div>
  );
}

type StarSpendRow = { domain: string; product: string; count: number; stars: number; users: number };

// 3단 그리드: 고민톡(리딩 수 + 타로 대화 별·유니크) / 운세 리포트(건수·유료·별·유니크) / 연애 상담(별 소모)
function StarProductGrid({ products }: { products: Record<string, unknown> | null }) {
  const starSpend = ((products as { starSpend?: StarSpendRow[] })?.starSpend ?? []) as StarSpendRow[];

  // 고민톡 — counsel(타로 리딩 수) + starSpend tarot(별·유니크) 병합. saju 는 진입 폐쇄로 제외.
  const counselRows = ((products as { counsel?: { emotionTag: string; consultationType: string; count: number }[] })?.counsel ?? [])
    .filter((c) => c.consultationType !== "saju");
  const counsel = new Map<string, { reads: number; stars: number; users: number }>();
  for (const c of counselRows) {
    const m = counsel.get(c.emotionTag) ?? { reads: 0, stars: 0, users: 0 };
    m.reads += c.count;
    counsel.set(c.emotionTag, m);
  }
  for (const g of starSpend.filter((g) => g.domain === "tarot")) {
    const m = counsel.get(g.product) ?? { reads: 0, stars: 0, users: 0 };
    m.stars += g.stars;
    m.users = Math.max(m.users, g.users);
    counsel.set(g.product, m);
  }

  // 운세 리포트 — fortune(무료 포함 건수·유료) + starSpend fortune(별·유니크) 병합
  const fortune = new Map<string, { reads: number; paid: number; stars: number; users: number }>();
  for (const f of ((products as { fortune?: { kind: string; count: number; paidCount: number }[] })?.fortune ?? []))
    fortune.set(f.kind, { reads: f.count, paid: f.paidCount, stars: 0, users: 0 });
  for (const g of starSpend.filter((g) => g.domain === "fortune")) {
    const m = fortune.get(g.product) ?? { reads: 0, paid: 0, stars: 0, users: 0 };
    m.stars = g.stars;
    m.users = g.users;
    fortune.set(g.product, m);
  }

  const relationship = starSpend.filter((g) => g.domain === "relationship");

  const Dash = () => <span className="text-white/30">-</span>;

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div>
        <h3 className="text-sm text-white/70 mb-2">고민톡 — 고민 분류별</h3>
        <table className="w-full text-[12px]">
          <thead className="text-white/40 text-left"><tr><th className="py-1">항목</th><th>건수</th><th>별</th><th>유니크</th></tr></thead>
          <tbody>
            {[...counsel.entries()].sort((a, b) => b[1].stars - a[1].stars || b[1].reads - a[1].reads).map(([tag, m]) => (
              <tr key={tag} className="border-t border-white/10">
                <td className="py-1">{tag}</td>
                <td>{m.reads}</td><td>{m.stars.toLocaleString()}</td>
                <td>{m.users > 0 ? m.users : <Dash />}</td>
              </tr>
            ))}
            {counsel.size === 0 && <tr><td colSpan={4} className="py-2 text-white/30">데이터 없음</td></tr>}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="text-sm text-white/70 mb-2">운세 리포트</h3>
        <table className="w-full text-[12px]">
          <thead className="text-white/40 text-left"><tr><th className="py-1">상품</th><th>건수</th><th>유료</th><th>별</th><th>유니크</th></tr></thead>
          <tbody>
            {[...fortune.entries()].sort((a, b) => b[1].stars - a[1].stars || b[1].reads - a[1].reads).map(([kind, m]) => (
              <tr key={kind} className="border-t border-white/10">
                <td className="py-1">{productLabel("fortune", kind)}</td>
                <td>{m.reads}</td><td>{m.paid}</td><td>{m.stars.toLocaleString()}</td>
                <td>{m.users > 0 ? m.users : <Dash />}</td>
              </tr>
            ))}
            {fortune.size === 0 && <tr><td colSpan={5} className="py-2 text-white/30">데이터 없음</td></tr>}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="text-sm text-white/70 mb-2">연애 상담</h3>
        <table className="w-full text-[12px]">
          <thead className="text-white/40 text-left"><tr><th className="py-1">상품</th><th>건수</th><th>별</th><th>유니크</th></tr></thead>
          <tbody>
            {relationship.map((g) => (
              <tr key={g.product} className="border-t border-white/10">
                <td className="py-1">{productLabel("relationship", g.product)}</td>
                <td>{g.count}</td><td>{g.stars.toLocaleString()}</td><td>{g.users}</td>
              </tr>
            ))}
            {relationship.length === 0 && <tr><td colSpan={4} className="py-2 text-white/30">데이터 없음</td></tr>}
          </tbody>
        </table>
      </div>
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
