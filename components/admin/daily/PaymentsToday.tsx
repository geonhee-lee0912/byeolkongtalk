// components/admin/daily/PaymentsToday.tsx — 오늘 결제 목록 (재결제 여부 · 오늘 쓴 곳).
import Link from "next/link";
import { PAYMENTS_LIMIT, type TodayPayment } from "@/lib/admin/daily-load";

const hhmm = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });

export function PaymentsToday({
  items, totalWon, truncated,
}: { items: TodayPayment[]; totalWon: number; truncated: boolean }) {
  if (items.length === 0) return <div className="text-[13px] text-white/50">오늘 결제 없음</div>;
  return (
    <div className="space-y-2">
      <div className="text-[13px] text-white/80">
        오늘 결제 {items.length}건 · ₩{totalWon.toLocaleString("ko-KR")}
      </div>
      {truncated && (
        <div className="text-[12px] text-amber-300/80">⚠️ 결제가 {PAYMENTS_LIMIT}건 상한에 닿아 일부가 빠졌을 수 있다.</div>
      )}
      <div className="overflow-x-auto rounded-xl bg-white/5 border border-white/10">
        <table className="w-full text-[13px] whitespace-nowrap">
          <thead className="text-white/50 text-left">
            <tr>
              <th className="px-3 py-2 font-normal">시각</th>
              <th className="px-3 py-2 font-normal">닉네임</th>
              <th className="px-3 py-2 font-normal">패키지</th>
              <th className="px-3 py-2 font-normal text-right">금액</th>
              <th className="px-3 py-2 font-normal">첫/재</th>
              <th className="px-3 py-2 font-normal">오늘 쓴 곳</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-t border-white/10">
                <td className="px-3 py-2 text-white/60">{hhmm(p.created_at)}</td>
                <td className="px-3 py-2">
                  {p.user_id ? (
                    <Link href={`/admin/users/${p.user_id}`} className="underline">{p.nickname ?? "(닉네임 없음)"}</Link>
                  ) : "(탈퇴)"}
                </td>
                <td className="px-3 py-2">{p.package_type ?? "—"} · {p.stars_given ?? 0}별</td>
                <td className="px-3 py-2 text-right">₩{p.amount_won.toLocaleString("ko-KR")}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${p.repeat ? "bg-emerald-400/15 text-emerald-300" : "bg-amber-300/15 text-amber-200"}`}>
                    {p.repeat ? "재" : "첫"}
                  </span>
                </td>
                <td className="px-3 py-2 text-white/70">{p.spends || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
