// components/admin/daily/PayRateTable.tsx — 결제율 3줄 (가입 후 48시간 안 결제).
import { countPct, type PayRateLine } from "@/lib/admin/daily";

export function PayRateTable({
  today, yesterday, mature7,
}: { today: PayRateLine; yesterday: PayRateLine; mature7: PayRateLine }) {
  const rows: { label: string; l: PayRateLine }[] = [
    { label: "오늘 (진행 중)", l: today },
    { label: "어제 (진행 중)", l: yesterday },
    { label: "성숙 7일", l: mature7 },
  ];
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl bg-white/5 border border-white/10">
        <table className="w-full text-[13px] whitespace-nowrap">
          <thead className="text-white/50 text-left">
            <tr>
              <th className="px-3 py-2 font-normal"></th>
              <th className="px-3 py-2 font-normal text-right">가입</th>
              <th className="px-3 py-2 font-normal text-right">결제자</th>
              <th className="px-3 py-2 font-normal text-right">P1</th>
              <th className="px-3 py-2 font-normal text-right">P2</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, l }) => (
              <tr key={label} className="border-t border-white/10">
                <td className="px-3 py-2 text-white/70">{label}</td>
                <td className="px-3 py-2 text-right">{l.signups}</td>
                <td className="px-3 py-2 text-right">{countPct(l.payers, l.signups)}</td>
                <td className="px-3 py-2 text-right">{countPct(l.p1, l.signups)}</td>
                <td className="px-3 py-2 text-right">{countPct(l.p2, l.signups)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[12px] text-white/35">
        P1 = 첫 리딩 전에 결제 · P2 = 첫 리딩 후 결제 · 진행 중 = 48시간이 아직 안 지난 코호트
      </div>
    </div>
  );
}
