// app/admin/ads/page.tsx — 광고 지출 입력/목록.
import { getServiceSupabase } from "@/lib/supabase";
import { daysAgoKstIso } from "@/lib/admin-time";
import { AdSpendForm } from "@/components/admin/AdSpendForm";
import { AdSpendUpload } from "@/components/admin/AdSpendUpload";

export const dynamic = "force-dynamic";

export default async function AdsPage() {
  const supa = getServiceSupabase();
  const [{ data: rows }, { data: acqs }] = await Promise.all([
    supa.from("ad_spend").select("*").order("spend_date", { ascending: false }).limit(500),
    supa.from("user_acquisition").select("utm_content").gte("created_at", daysAgoKstIso(89)).limit(100000),
  ]);
  const suggestions = [...new Set((acqs ?? []).map((a) => a.utm_content).filter(Boolean) as string[])];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">광고 지출 <span className="text-white/40 text-sm">(수동 입력 · 선택)</span></h1>
      <p className="text-[13px] text-white/50">메타 Ads Manager 숫자를 일자·소재별로 입력하면 애널리틱스의 CAC·ROAS가 채워집니다. 입력 안 해도 다른 지표는 모두 동작합니다.</p>
      <AdSpendUpload />
      <AdSpendForm creativeSuggestions={suggestions} />

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="text-white/50 text-left"><tr>
            <th className="py-1">날짜</th><th>캠페인</th><th>소재</th><th>노출</th><th>클릭</th><th>지출(원)</th>
          </tr></thead>
          <tbody>
            {(rows ?? []).map((r: Record<string, unknown>) => (
              <tr key={String(r.id)} className="border-t border-white/10">
                <td className="py-1.5">{String(r.spend_date)}</td>
                <td>{String(r.campaign ?? "")}</td>
                <td>{String(r.creative_key ?? "")}</td>
                <td>{r.impressions == null ? "—" : Number(r.impressions).toLocaleString()}</td>
                <td>{r.clicks == null ? "—" : Number(r.clicks).toLocaleString()}</td>
                <td>{Number(r.spend_won).toLocaleString()}</td>
              </tr>
            ))}
            {(rows ?? []).length === 0 && <tr><td colSpan={6} className="py-3 text-white/30">아직 입력된 지출이 없어요.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
