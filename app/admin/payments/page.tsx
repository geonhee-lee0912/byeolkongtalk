// app/admin/payments/page.tsx — 결제 내역.
import { getServiceSupabase } from "@/lib/supabase";
import { RefundButton } from "@/components/admin/RefundButton";

export const dynamic = "force-dynamic";

export default async function AdminPayments() {
  const supabase = getServiceSupabase();
  const { data } = await supabase.from("payments")
    .select("id, amount_won, stars_given, package_type, status, created_at")
    .order("created_at", { ascending: false }).limit(50);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">결제/정산</h1>
      <table className="w-full text-sm">
        <thead className="text-white/50 text-left">
          <tr><th className="py-2">패키지</th><th>금액</th><th>별</th><th>상태</th><th>일시</th><th></th></tr>
        </thead>
        <tbody>
          {(data ?? []).map((p) => (
            <tr key={p.id} className="border-t border-white/10">
              <td className="py-2">{p.package_type}</td>
              <td>{p.amount_won.toLocaleString()}원</td>
              <td>{p.stars_given}</td>
              <td>{p.status}</td>
              <td>{new Date(p.created_at).toLocaleDateString("ko-KR")}</td>
              <td className="text-right">{p.status === "completed" && <RefundButton id={p.id} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
