// components/admin/daily/CreativeTable.tsx — 광고 소재별 성과 (최근 7일).
import type { CreativeRow } from "@/lib/admin/daily-load";

const won = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;

export function CreativeTable({ items, truncated }: { items: CreativeRow[]; truncated: boolean }) {
  if (items.length === 0) return <div className="text-[13px] text-white/50">최근 7일 소재 데이터 없음</div>;
  return (
    <div className="space-y-2">
      {truncated && (
        <div className="text-[12px] text-amber-300/80">⚠️ 조회 상한에 닿아 일부 소재·클릭이 빠졌을 수 있다.</div>
      )}
      <div className="overflow-x-auto rounded-xl bg-white/5 border border-white/10">
        <table className="w-full text-[13px] whitespace-nowrap">
          <thead className="text-white/50 text-left">
            <tr>
              <th className="px-3 py-2 font-normal">소재</th>
              <th className="px-3 py-2 font-normal text-right">지출</th>
              <th className="px-3 py-2 font-normal text-right">클릭</th>
              <th className="px-3 py-2 font-normal text-right">가입</th>
              <th className="px-3 py-2 font-normal text-right">클릭→가입</th>
              <th className="px-3 py-2 font-normal text-right">결제자</th>
              <th className="px-3 py-2 font-normal text-right">매출</th>
              <th className="px-3 py-2 font-normal text-right">CAC</th>
              <th className="px-3 py-2 font-normal text-right">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.creative} className="border-t border-white/10">
                <td className="px-3 py-2">{c.creative}</td>
                <td className="px-3 py-2 text-right">{won(c.spend_won)}</td>
                <td className="px-3 py-2 text-right">{c.clicks.toLocaleString("ko-KR")}</td>
                <td className="px-3 py-2 text-right">{c.signups}</td>
                <td className="px-3 py-2 text-right">
                  {c.clicks > 0 ? `${((c.signups / c.clicks) * 100).toFixed(1)}%` : "—"}
                </td>
                <td className="px-3 py-2 text-right">{c.first_paid}</td>
                <td className="px-3 py-2 text-right">{won(c.revenue_won)}</td>
                <td className="px-3 py-2 text-right">{c.cac == null ? "—" : won(c.cac)}</td>
                <td className="px-3 py-2 text-right">{c.roas == null ? "—" : c.roas.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
