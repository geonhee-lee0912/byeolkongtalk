// components/admin/daily/PeriodPayersTable.tsx — 그 기간 실제 결제자(결제한 날 기준). 결제율 표 바로 아래.
import type { PeriodPayerLine } from "@/lib/admin/platform";

export function PeriodPayersTable({
  rows, total,
}: { rows: PeriodPayerLine[]; total: { people: number; payments: number; won: number } }) {
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl bg-white/5 border border-white/10">
        <table className="w-full text-[13px] whitespace-nowrap">
          <thead className="text-white/50 text-left">
            <tr>
              <th className="px-3 py-2 font-normal"></th>
              <th className="px-3 py-2 font-normal text-right">사람</th>
              <th className="px-3 py-2 font-normal text-right">건</th>
              <th className="px-3 py-2 font-normal text-right">금액</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.segment} className="border-t border-white/10">
                <td className="px-3 py-2 text-white/70">{r.label}</td>
                <td className="px-3 py-2 text-right">{r.people === null ? "—" : r.people}</td>
                <td className="px-3 py-2 text-right">{r.payments}</td>
                <td className="px-3 py-2 text-right">{r.won.toLocaleString("ko-KR")}원</td>
              </tr>
            ))}
            <tr className="border-t border-white/20 font-semibold">
              <td className="px-3 py-2">합계</td>
              <td className="px-3 py-2 text-right">{total.people}{rows.some((r) => r.people === null && r.payments > 0) ? " + 탈퇴" : ""}</td>
              <td className="px-3 py-2 text-right">{total.payments}</td>
              <td className="px-3 py-2 text-right">{total.won.toLocaleString("ko-KR")}원</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="text-[12px] text-white/35">
        결제한 날 기준(결제율 성숙 7일과 같은 날짜) · 환불 제외 · 결제율은 가입한 날 기준이라 신규 줄이 딱 맞지는 않음
      </div>
    </div>
  );
}
