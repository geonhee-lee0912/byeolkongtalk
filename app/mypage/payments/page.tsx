"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Payment {
  id: string;
  packageLabel: string;
  stars: number;
  amount: number;
  status: "pending" | "completed" | "refunded";
  paidAt: number;
}

interface StarTx {
  id: string;
  type: "charge" | "spend" | "bonus" | "refund";
  typeLabel: string;
  signedAmount: number;
  balanceAfter: number;
  source: string;
  createdAt: number;
}

const PAYMENT_STATUS_LABEL: Record<Payment["status"], string> = {
  pending: "대기",
  completed: "완료",
  refunded: "환불",
};

function fmtDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}. ${p(d.getMonth() + 1)}. ${p(d.getDate())}`;
}

type Row =
  | { kind: "payment"; id: string; time: number; payment: Payment }
  | { kind: "star"; id: string; time: number; tx: StarTx };

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [txs, setTxs] = useState<StarTx[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [pay, tx, bal] = await Promise.all([
        fetch("/api/payments/list", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
        fetch("/api/stars/transactions", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
        fetch("/api/stars/balance", { cache: "no-store" })
          .then((x) => (x.ok ? x.json() : null))
          .catch(() => null),
      ]);
      if (pay?.payments) setPayments(pay.payments as Payment[]);
      if (tx?.transactions) setTxs(tx.transactions as StarTx[]);
      if (bal) setBalance(bal.balance ?? 0);
      setLoading(false);
    })();
  }, []);

  const totalCharged = payments
    .filter((p) => p.status === "completed")
    .reduce((s, p) => s + p.amount, 0);

  const rows: Row[] = [
    ...payments.map(
      (p): Row => ({ kind: "payment", id: `p-${p.id}`, time: p.paidAt, payment: p })
    ),
    ...txs.map(
      (t): Row => ({ kind: "star", id: `s-${t.id}`, time: t.createdAt, tx: t })
    ),
  ].sort((a, b) => b.time - a.time);

  return (
    <main className="flex flex-1 flex-col items-center py-8 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 mb-5">
        <Link href="/mypage" className="text-[12px] text-text-light/70">
          ‹ 내 정보
        </Link>
      </div>

      {/* 요약 */}
      <div className="w-full max-w-md mx-auto px-5 mb-5">
        <div className="bg-gradient-to-br from-gold-soft/30 via-cream-warm to-lilac-soft/40 rounded-2xl p-4 border border-gold-soft/40 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-text-light/80 mb-1">현재 별 잔액</div>
            <div className="text-[20px] font-bold text-eye-purple">
              ⭐ {balance ?? 0}별
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-text-light/80 mb-1">누적 결제</div>
            <div className="text-[15px] font-bold text-eye-purple">
              {totalCharged.toLocaleString()}원
            </div>
          </div>
        </div>
      </div>

      {/* 통합 내역 */}
      <div className="w-full max-w-md mx-auto px-5">
        {loading ? (
          <p className="text-text-light text-[13px] text-center py-8">잠시만…</p>
        ) : rows.length === 0 ? (
          <p className="text-text-light/70 text-[13px] text-center py-8">
            아직 내역이 없어
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((row) =>
              row.kind === "payment" ? (
                <div
                  key={row.id}
                  className="bg-cream-warm rounded-2xl p-3 border border-lilac-mid/30 flex items-center justify-between"
                >
                  <div>
                    <div className="text-[14px] font-bold text-eye-purple">
                      {row.payment.packageLabel}
                      <span className="ml-2 text-[11px] font-normal text-text-light/70">
                        결제 · {PAYMENT_STATUS_LABEL[row.payment.status]}
                      </span>
                    </div>
                    <div className="text-[11px] text-text-light/70 mt-0.5">
                      {fmtDate(row.payment.paidAt)} · ⭐{row.payment.stars}별
                    </div>
                  </div>
                  <div className="text-[14px] font-bold text-eye-purple">
                    {row.payment.amount.toLocaleString()}원
                  </div>
                </div>
              ) : (
                <div
                  key={row.id}
                  className="bg-cream-warm rounded-2xl p-3 border border-lilac-mid/30 flex items-center justify-between"
                >
                  <div>
                    <div className="text-[14px] font-bold text-eye-purple">
                      {row.tx.typeLabel}
                    </div>
                    <div className="text-[11px] text-text-light/70 mt-0.5">
                      {fmtDate(row.tx.createdAt)} · 잔액 {row.tx.balanceAfter}별
                    </div>
                  </div>
                  <div
                    className={`text-[14px] font-bold ${
                      row.tx.signedAmount < 0 ? "text-text-light" : "text-eye-purple"
                    }`}
                  >
                    {row.tx.signedAmount > 0 ? "+" : ""}
                    {row.tx.signedAmount}별
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </main>
  );
}
