"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useScreenCache } from "@/lib/screen-cache";
import { starTxLabel, historyDayLabel, mergeHistory, type HistoryPayment, type HistoryStarTx, type HistoryRow } from "@/lib/wallet-history";

type Payment = HistoryPayment;
type StarTx = HistoryStarTx;

const PAYMENT_STATUS_LABEL: Record<Payment["status"], string> = {
  pending: "대기",
  completed: "완료",
  refunded: "환불",
};

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// 한 번에 보이는 줄 수 — '더 보기'로 이만큼씩 늘린다(디자인 다듬기 결제 내역 ⑧ A — 예전엔 5줄씩 페이지 번호 1~20 이 빽빽했다)
const STEP = 20;

type Row = HistoryRow;

// 화면 기억(lib/screen-cache) — 다시 열면 '잠시만…' 대신 마지막 내역을 바로 그리고 새로 불러와 바꾼다
interface PaymentsSnapshot {
  payments: Payment[];
  txs: StarTx[];
  balance: number | null;
}
const CACHE_KEY = "mypage/payments";

export default function PaymentsPage() {
  const { cached, save } = useScreenCache<PaymentsSnapshot>(CACHE_KEY);
  const [payments, setPayments] = useState<Payment[]>(cached?.payments ?? []);
  const [txs, setTxs] = useState<StarTx[]>(cached?.txs ?? []);
  const [balance, setBalance] = useState<number | null>(cached?.balance ?? null);
  const [loading, setLoading] = useState(!cached);
  const [shown, setShown] = useState(STEP);

  useEffect(() => {
    if (!loading) save({ payments, txs, balance } satisfies PaymentsSnapshot);
  }, [save, loading, payments, txs, balance]);

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

  // 결제 줄과 그 결제의 '별 충전' 줄은 한 줄로 합친다(결제 번호로 짝 — lib/wallet-history)
  const rows: Row[] = mergeHistory(payments, txs);

  // 날짜별 묶음(최신순 그대로 이어 붙인다)
  const now = Date.now();
  const groups: { day: string; rows: Row[] }[] = [];
  for (const row of rows.slice(0, shown)) {
    const day = historyDayLabel(row.time, now);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.rows.push(row);
    else groups.push({ day, rows: [row] });
  }

  return (
    <main className={`flex flex-1 flex-col items-center py-8 w-full ${cached ? "" : "animate-fade-in"}`}>
      {/* 앱에선 앱 헤더의 ‹ 와 겹쳐 숨긴다(web-only) */}
      <div className="web-only w-full max-w-md mx-auto px-5 mb-5">
        <Link href="/mypage" className="text-12 text-text-light">
          ‹ 내 정보
        </Link>
      </div>

      {/* 요약 — 마이·상점과 같은 노란 잔액 카드(디자인 다듬기 결제 내역, 마이 ① M1 을 따름) */}
      <div className="w-full max-w-md mx-auto px-5 mb-5">
        <div className="relative overflow-hidden rounded-2xl bg-[#FFF6E3] p-4 flex items-end justify-between">
          <svg viewBox="0 0 24 24" className="absolute -right-3 -top-3 w-16 h-16 opacity-25 rotate-12 pointer-events-none" aria-hidden>
            <path d="M12 1.8 15.4 8.6 22.2 12 15.4 15.4 12 22.2 8.6 15.4 1.8 12 8.6 8.6Z" fill="#E8C26A" />
          </svg>
          <div className="relative">
            <div className="text-11 font-bold text-[#7A5A1F]">지금 가진 별</div>
            <div className="text-22 font-black text-eye-purple tabular-nums leading-tight">
              {balance ?? 0}
              <span className="text-13 font-bold text-text-light ml-1">별</span>
            </div>
          </div>
          <div className="relative text-right">
            <div className="text-11 font-bold text-[#7A5A1F]">누적 결제</div>
            <div className="text-15 font-bold text-eye-purple tabular-nums">
              {totalCharged.toLocaleString()}원
            </div>
          </div>
        </div>
      </div>

      {/* 통합 내역 — 날짜 제목 아래 한 카드에 그날 줄을 묶는다. 별 줄 제목 = 무엇에 썼는지(결제 내역 ⑨ A) */}
      <div className="w-full max-w-md mx-auto px-5">
        {loading ? (
          <p className="text-text-light text-13 text-center py-8">잠시만…</p>
        ) : rows.length === 0 ? (
          <p className="text-text-light text-13 text-center py-8">
            아직 내역이 없어
          </p>
        ) : (
          <>
            {groups.map((g, gi) => (
              <section key={g.day} className={gi === 0 ? "" : "mt-4"}>
                <h2 className="text-13 font-bold text-eye-purple mb-2">{g.day}</h2>
                <div className="bg-white rounded-2xl shadow-card overflow-hidden divide-y divide-lilac-mid/15">
                  {g.rows.map((row) =>
                    row.kind === "payment" ? (
                      <div key={row.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-14 font-bold text-eye-purple truncate">별 충전</div>
                          <div className="text-11 text-text-light mt-0.5 tabular-nums">
                            {fmtTime(row.payment.paidAt)} · {row.payment.amount.toLocaleString()}원 결제{row.payment.status === "completed" ? "" : ` ${PAYMENT_STATUS_LABEL[row.payment.status]}`}
                            {row.charge && ` · 잔액 ${row.charge.balanceAfter}별`}
                          </div>
                        </div>
                        {/* 별이 실제로 들어온 결제(짝 있음)만 '+N별' — 대기·환불처럼 짝이 없으면 결제 금액만 */}
                        {row.charge ? (
                          <div className="shrink-0 text-14 font-bold text-accent tabular-nums">+{row.charge.signedAmount}별</div>
                        ) : (
                          <div className="shrink-0 text-14 font-bold text-text-light tabular-nums">{row.payment.amount.toLocaleString()}원</div>
                        )}
                      </div>
                    ) : (
                      <div key={row.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-14 font-bold text-eye-purple truncate">
                            {starTxLabel(row.tx.type, row.tx.source)}
                          </div>
                          <div className="text-11 text-text-light mt-0.5 tabular-nums">
                            {fmtTime(row.tx.createdAt)} · 잔액 {row.tx.balanceAfter}별
                          </div>
                        </div>
                        <div
                          className={`shrink-0 text-14 font-bold tabular-nums ${
                            row.tx.signedAmount < 0 ? "text-text-light" : "text-accent"
                          }`}
                        >
                          {row.tx.signedAmount > 0 ? "+" : ""}
                          {row.tx.signedAmount}별
                        </div>
                      </div>
                    )
                  )}
                </div>
              </section>
            ))}
            {rows.length > shown && (
              <button
                type="button"
                onClick={() => setShown((n) => n + STEP)}
                className="btn btn-secondary btn-md w-full mt-4"
              >
                더 보기
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
