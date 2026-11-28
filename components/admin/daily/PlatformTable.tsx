// components/admin/daily/PlatformTable.tsx — 앱 / 웹: 오늘 · 어제 · 최근 7일의 방문·가입·결제.
import type { PlatformCounts } from "@/lib/admin/platform";

export const PLATFORM_NOTE =
  "앱 = 별콩톡 앱 웹뷰 · 가입 앱/웹 = 가입 직후 첫 방문 기준 · 방문 앱+웹은 전체보다 클 수 있음 · 결제 환불 제외";

const pay = (n: number, won: number) => (n === 0 ? "0" : `${n}건 / ${won.toLocaleString("ko-KR")}원`);

export function PlatformTable({
  today, yesterday, last7,
}: { today: PlatformCounts; yesterday: PlatformCounts; last7: PlatformCounts }) {
  const rows: { label: string; c: PlatformCounts }[] = [
    { label: "오늘", c: today },
    { label: "어제", c: yesterday },
    { label: "최근 7일", c: last7 },
  ];
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl bg-white/5 border border-white/10">
        <table className="w-full text-[13px] whitespace-nowrap">
          <thead className="text-white/50 text-left">
            <tr>
              <th className="px-3 py-1 font-normal"></th>
              <th className="px-3 py-1 font-normal text-center border-l border-white/10" colSpan={2}>방문(UV)</th>
              <th className="px-3 py-1 font-normal text-center border-l border-white/10" colSpan={3}>가입</th>
              <th className="px-3 py-1 font-normal text-center border-l border-white/10" colSpan={3}>결제</th>
            </tr>
            <tr>
              <th className="px-3 py-1 font-normal"></th>
              <th className="px-3 py-1 font-normal text-right border-l border-white/10">앱</th>
              <th className="px-3 py-1 font-normal text-right">웹</th>
              <th className="px-3 py-1 font-normal text-right border-l border-white/10">앱</th>
              <th className="px-3 py-1 font-normal text-right">웹</th>
              <th className="px-3 py-1 font-normal text-right">모름</th>
              <th className="px-3 py-1 font-normal text-right border-l border-white/10">토스</th>
              <th className="px-3 py-1 font-normal text-right">애플</th>
              <th className="px-3 py-1 font-normal text-right">구글</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, c }) => (
              <tr key={label} className="border-t border-white/10">
                <td className="px-3 py-2 text-white/70">{label}</td>
                <td className="px-3 py-2 text-right border-l border-white/10">{c.uvApp}</td>
                <td className="px-3 py-2 text-right">{c.uvWeb}</td>
                <td className="px-3 py-2 text-right border-l border-white/10">{c.signupsApp}</td>
                <td className="px-3 py-2 text-right">{c.signupsWeb}</td>
                <td className="px-3 py-2 text-right">{c.signupsUnknown}</td>
                <td className="px-3 py-2 text-right border-l border-white/10">{pay(c.payToss, c.wonToss)}</td>
                <td className="px-3 py-2 text-right">{pay(c.payApple, c.wonApple)}</td>
                <td className="px-3 py-2 text-right">{pay(c.payGoogle, c.wonGoogle)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-[12px] text-white/35">{PLATFORM_NOTE}</div>
    </div>
  );
}
