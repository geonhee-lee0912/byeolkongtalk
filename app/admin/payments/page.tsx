// app/admin/payments/page.tsx — 결제 내역.
import { getServiceSupabase } from "@/lib/supabase";
import { RefundButton } from "@/components/admin/RefundButton";
import LoadFailed from "@/components/admin/LoadFailed";
import { adminExclusionArray } from "@/lib/admin";
import { daysAgoKstIso } from "@/lib/admin-time";
import { storeRevenueRows, type StoreRevenueRpcRow } from "@/lib/admin/store-revenue";

export const dynamic = "force-dynamic";

type RefundInfo = { at: string; reason: string };

const PROVIDER_LABEL: Record<string, string> = { tosspayments: "토스", apple: "애플", google: "구글" };
const won = (n: number) => `${n.toLocaleString()}원`;

export default async function AdminPayments() {
  const supabase = getServiceSupabase();
  // 🔴 목록 조회 실패를 빈 표로 위장하지 않는다 — 결제 화면의 빈 표는 "오늘 매출 0"으로 읽힌다.
  const { data, error: listError } = await supabase.from("payments")
    .select("id, user_id, pg_tid, pg_provider, amount_won, stars_given, bonus_stars, package_type, status, created_at, refunded_at, stars_clawed_back, clawback_shortfall")
    .order("created_at", { ascending: false }).limit(50);

  // 스토어 매출 — 최근 30일(KST 자정 기준). NULL 이 섞이면 SQL 의 <> ALL 이 전부 버리므로 빈 값은 뺀다.
  const p_exclude = adminExclusionArray().filter((id): id is string => !!id);
  const { data: storeData, error: storeError } = await supabase.rpc("admin_store_revenue", {
    p_since: daysAgoKstIso(30), p_exclude,
  });
  const store = storeError ? null : storeRevenueRows((storeData ?? []) as StoreRevenueRpcRow[]);

  const listFailed = !!listError;
  const payments = data ?? [];

  // 환불 시각·사유는 admin_actions(payment_refund)에 기록돼 있다 — 조회해서 매핑.
  const refundedIds = payments.filter((p) => p.status === "refunded").map((p) => p.id);
  const refundMap = new Map<string, RefundInfo>();
  let refundFailed = false;
  if (refundedIds.length > 0) {
    const { data: actions, error: actionsError } = await supabase.from("admin_actions")
      .select("target_id, payload, created_at")
      .eq("action", "payment_refund")
      .in("target_id", refundedIds)
      .order("created_at", { ascending: false });
    refundFailed = !!actionsError;
    for (const a of actions ?? []) {
      if (!a.target_id || refundMap.has(a.target_id)) continue; // 최신 1건만
      const payload = (a.payload ?? {}) as Record<string, unknown>;
      const reason = typeof payload.reason === "string" ? payload.reason : "";
      refundMap.set(a.target_id, { at: a.created_at, reason });
    }
  }

  // 환불 판단용: 사용자별 별 사용 현황(누적 사용 + 잔액). 별은 계정 공용이라
  // "이 결제분"만 콕 집어낼 순 없고, 계정 누적 사용량으로 정책 판단을 돕는다.
  // 탈퇴 익명화 결제행은 user_id 가 NULL — star 조회 대상에서 뺀다(NULL 로는 잔액을 못 붙인다)
  const userIds = [...new Set(payments.map((p) => p.user_id))].filter((id): id is string => !!id);
  const starMap = new Map<string, { balance: number; spent: number }>();
  let starFailed = false;
  if (userIds.length > 0) {
    const { data: bals, error: balsError } = await supabase.from("star_balances")
      .select("user_id, balance, total_spent")
      .in("user_id", userIds);
    starFailed = !!balsError;
    for (const b of bals ?? []) {
      starMap.set(b.user_id, { balance: b.balance ?? 0, spent: b.total_spent ?? 0 });
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">결제/정산</h1>
      {/* 보강 조회 실패 — 목록은 살리되 어느 칸이 못 믿을 값인지 밝힌다 */}
      <div>
        <h2 className="text-sm font-semibold mb-2">스토어 결제 <span className="text-white/50 font-normal">최근 30일</span></h2>
        {!store ? (
          <LoadFailed block="스토어 매출(admin_store_revenue)" />
        ) : store.rows.length === 0 ? (
          <p className="text-sm text-white/50">스토어 결제 없음</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-white/50 text-left">
                <tr><th className="py-2">수단</th><th>결제 수</th><th>총액</th><th>수수료 추정</th><th>순매출</th><th>환불</th><th>덜 회수된 별</th></tr>
              </thead>
              <tbody>
                {[...store.rows, store.total].map((r) => (
                  <tr key={r.label} className="border-t border-white/10">
                    <td className="py-2">{r.label}</td>
                    <td>{r.payments}</td>
                    <td>{won(r.gross)}</td>
                    <td>{won(r.fee)}</td>
                    <td>{won(r.net)}</td>
                    <td>{r.refunded}건 · {won(r.refundedWon)}</td>
                    <td>{r.shortfallStars}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-white/40 mt-1">
              수수료는 추정치. 탈퇴 회원의 환불은 덜 회수된 별에 잡히지 않는다.
            </p>
          </div>
        )}
      </div>
      {refundFailed && <LoadFailed block="환불 시각·사유(admin_actions)" />}
      {starFailed && <LoadFailed block="별 잔액·누적 사용(star_balances)" />}
      {listFailed ? (
        <LoadFailed block="결제 목록(payments)" />
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-white/50 text-left">
            <tr><th className="py-2">사용자</th><th>수단</th><th>패키지</th><th>금액</th><th>별</th><th>별 사용</th><th>상태</th><th>일시</th><th></th></tr>
          </thead>
          <tbody>
            {payments.map((p) => {
              const refund = p.status === "refunded" ? refundMap.get(p.id) : undefined;
              const star = starMap.get(p.user_id);
              return (
                <tr key={p.id} className="border-t border-white/10 align-top">
                  <td className="py-2 font-mono text-xs">{p.user_id ? p.user_id.slice(0, 8) : "(탈퇴)"}</td>
                  <td>{PROVIDER_LABEL[p.pg_provider] ?? p.pg_provider}</td>
                  <td>{p.package_type}</td>
                  <td>{p.amount_won.toLocaleString()}원</td>
                  <td>{p.stars_given}{p.bonus_stars > 0 ? ` (+${p.bonus_stars})` : ""}</td>
                  <td className="whitespace-nowrap">
                    {starFailed ? (
                      <span className="text-white/40">—</span>
                    ) : !star ? (
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
                        {refundFailed ? (
                          <div className="text-[11px] text-white/40 mt-0.5">—</div>
                        ) : refund ? (
                          <div className="text-[11px] text-white/50 mt-0.5">
                            {new Date(refund.at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                            {refund.reason ? ` · ${refund.reason}` : ""}
                          </div>
                        ) : null}
                        {p.pg_provider !== "tosspayments" && (
                          <div className="text-[11px] text-white/50 mt-0.5">
                            회수 {p.stars_clawed_back ?? 0}
                            {!p.user_id ? (
                              <span> · 탈퇴 회원</span>
                            ) : p.clawback_shortfall == null ? (
                              <span className="text-white/40"> · 회수 대기</span>
                            ) : p.clawback_shortfall > 0 ? (
                              <span className="text-amber-300"> · 덜 회수 {p.clawback_shortfall}</span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : p.status === "completed" ? (
                      "완료"
                    ) : (
                      "대기"
                    )}
                  </td>
                  <td className="whitespace-nowrap">{new Date(p.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</td>
                  <td className="text-right">
                    {p.pg_provider === "tosspayments"
                      ? p.status === "completed" && p.pg_tid && <RefundButton id={p.id} />
                      : p.status === "completed" && <span className="text-[11px] text-white/40">스토어 환불만</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
