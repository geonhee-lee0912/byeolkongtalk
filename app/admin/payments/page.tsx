// app/admin/payments/page.tsx — 결제 내역.
import { getServiceSupabase } from "@/lib/supabase";
import { RefundButton } from "@/components/admin/RefundButton";

export const dynamic = "force-dynamic";

type RefundInfo = { at: string; reason: string };

export default async function AdminPayments() {
  const supabase = getServiceSupabase();
  const { data } = await supabase.from("payments")
    .select("id, user_id, pg_tid, amount_won, stars_given, package_type, status, created_at")
    .order("created_at", { ascending: false }).limit(50);

  const payments = data ?? [];

  // 환불 시각·사유는 admin_actions(payment_refund)에 기록돼 있다 — 조회해서 매핑.
  const refundedIds = payments.filter((p) => p.status === "refunded").map((p) => p.id);
  const refundMap = new Map<string, RefundInfo>();
  if (refundedIds.length > 0) {
    const { data: actions } = await supabase.from("admin_actions")
      .select("target_id, payload, created_at")
      .eq("action", "payment_refund")
      .in("target_id", refundedIds)
      .order("created_at", { ascending: false });
    for (const a of actions ?? []) {
      if (!a.target_id || refundMap.has(a.target_id)) continue; // 최신 1건만
      const payload = (a.payload ?? {}) as Record<string, unknown>;
      const reason = typeof payload.reason === "string" ? payload.reason : "";
      refundMap.set(a.target_id, { at: a.created_at, reason });
    }
  }

  // 환불 판단용: 사용자별 별 사용 현황(누적 사용 + 잔액). 별은 계정 공용이라
  // "이 결제분"만 콕 집어낼 순 없고, 계정 누적 사용량으로 정책 판단을 돕는다.
  const userIds = [...new Set(payments.map((p) => p.user_id))];
  const starMap = new Map<string, { balance: number; spent: number }>();
  if (userIds.length > 0) {
    const { data: bals } = await supabase.from("star_balances")
      .select("user_id, balance, total_spent")
      .in("user_id", userIds);
    for (const b of bals ?? []) {
      starMap.set(b.user_id, { balance: b.balance ?? 0, spent: b.total_spent ?? 0 });
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">결제/정산</h1>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-white/50 text-left">
            <tr><th className="py-2">사용자</th><th>패키지</th><th>금액</th><th>별</th><th>별 사용</th><th>상태</th><th>일시</th><th></th></tr>
          </thead>
          <tbody>
            {payments.map((p) => {
              const refund = p.status === "refunded" ? refundMap.get(p.id) : undefined;
              const star = starMap.get(p.user_id);
              return (
                <tr key={p.id} className="border-t border-white/10 align-top">
                  <td className="py-2 font-mono text-xs">{p.user_id.slice(0, 8)}</td>
                  <td>{p.package_type}</td>
                  <td>{p.amount_won.toLocaleString()}원</td>
                  <td>{p.stars_given}</td>
                  <td className="whitespace-nowrap">
                    {!star ? (
                      <span className="text-white/40">-</span>
                    ) : star.spent === 0 ? (
                      <span className="text-emerald-300">미사용 · 잔액 {star.balance}</span>
                    ) : (
                      <span className="text-amber-300">사용 {star.spent} · 잔액 {star.balance}</span>
                    )}
                  </td>
                  <td>
                    {p.status === "refunded" ? (
                      <div>
                        <span className="text-red-300 font-medium">환불됨</span>
                        {refund && (
                          <div className="text-[11px] text-white/50 mt-0.5">
                            {new Date(refund.at).toLocaleString("ko-KR")}
                            {refund.reason ? ` · ${refund.reason}` : ""}
                          </div>
                        )}
                      </div>
                    ) : p.status === "completed" ? (
                      "완료"
                    ) : (
                      "대기"
                    )}
                  </td>
                  <td className="whitespace-nowrap">{new Date(p.created_at).toLocaleDateString("ko-KR")}</td>
                  <td className="text-right">{p.status === "completed" && p.pg_tid && <RefundButton id={p.id} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
