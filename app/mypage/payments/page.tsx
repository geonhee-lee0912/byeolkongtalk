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

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const PAGE_SIZE = 5;

type Row =
  | { kind: "payment"; id: string; time: number; payment: Payment }
  | { kind: "star"; id: string; time: number; tx: StarTx };

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [txs, setTxs] = useState<StarTx[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

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

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pagedRows = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const goPage = (n: number) => {
    setPage(Math.max(0, Math.min(totalPages - 1, n)));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main className="flex flex-1 flex-col items-center py-8 w-full animate-fade-in">
      <div className="w-full max-w-md mx-auto px-5 mb-5">
        <Link href="/mypage" className="text-[12px] text-text-light/70">
          ‹ 내 정보
        </Link>
      </div>

      {/* 요약 */}
      <div className="w-full max-w-md mx-auto px-5 mb-5">
        <div className="bg-gradient-to-br from-eye-purple via-lilac-deep to-eye-purple rounded-2xl p-4 shadow-lg shadow-lilac-deep/30 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-white/75 mb-1">현재 별 잔액</div>
            <div className="text-[22px] font-bold text-gold-soft">
              ⭐ {balance ?? 0}별
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-white/75 mb-1">누적 결제</div>
            <div className="text-[15px] font-bold text-white">
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
            {pagedRows.map((row) =>
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
                    <div className="text-[11px] mt-0.5">
                      <span className="font-bold text-eye-purple/80">
                        {fmtDate(row.payment.paidAt)} {fmtTime(row.payment.paidAt)}
                      </span>
                      <span className="text-text-light/70"> · ⭐{row.payment.stars}별</span>
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
                    <div className="text-[11px] mt-0.5">
                      <span className="font-bold text-eye-purple/80">
                        {fmtDate(row.tx.createdAt)} {fmtTime(row.tx.createdAt)}
                      </span>
                      <span className="text-text-light/70"> · 잔액 {row.tx.balanceAfter}별</span>
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

        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              onClick={() => goPage(safePage - 1)}
              disabled={safePage === 0}
              aria-label="이전"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-eye-purple disabled:opacity-30"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => goPage(i)}
                aria-label={`${i + 1}페이지`}
                className={`w-7 h-7 rounded-lg text-[12px] font-bold ${
                  i === safePage
                    ? "bg-lilac-deep text-white"
                    : "text-text-light/70 hover:bg-lilac-soft/50"
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => goPage(safePage + 1)}
              disabled={safePage === totalPages - 1}
              aria-label="다음"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-eye-purple disabled:opacity-30"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
