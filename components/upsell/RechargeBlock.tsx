"use client";

// 결과 화면 최상단 재충전 블록 — 리딩 직후 따끈한 순간에 매출 CTA를 앞세운다.
// 이 고민 이어가기(-40%) + 새 고민 + (자격자) 첫충전 +50% 보너스 인라인.
import { useEffect, useState } from "react";
import Link from "next/link";

export default function RechargeBlock({
  allowContinue,
  onContinue,
  newHref,
  newLabel,
  newCostLabel,
}: {
  allowContinue: boolean;
  onContinue: () => void;
  newHref: string;
  newLabel: string;
  newCostLabel: string;
}) {
  const [firstChargeEligible, setFirstChargeEligible] = useState(false);

  useEffect(() => {
    void fetch("/api/stars/first-charge-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFirstChargeEligible(d?.eligible === true))
      .catch(() => {});
  }, []);

  return (
    <div className="w-full max-w-md mx-auto px-5 mt-6">
      <div className="rounded-2xl bg-white/90 p-4">
        <p className="text-[14px] font-bold text-eye-purple mb-3">
          이 고민, 더 깊이 이어가볼까?
        </p>
        {allowContinue && (
          <button
            onClick={onContinue}
            className="w-full py-3 mb-2 rounded-xl bg-lilac-deep text-white font-bold text-[14px] flex items-center justify-between px-4 hover:bg-lilac-deep/90 transition"
          >
            <span>이 고민 이어가기</span>
            <span className="text-[12px] font-bold bg-white/20 rounded-lg px-2 py-0.5">
              40% 할인
            </span>
          </button>
        )}
        <Link
          href={newHref}
          className="w-full py-3 rounded-xl border border-lilac-deep/40 text-lilac-deep font-bold text-[13.5px] flex items-center justify-between px-4 hover:bg-lilac-deep/5 transition"
        >
          <span>{newLabel}</span>
          <span className="text-[12px] text-text-light/80">{newCostLabel}</span>
        </Link>
        {firstChargeEligible && (
          <Link
            href="/shop"
            className="flex items-center gap-2.5 mt-3 rounded-xl px-3 py-2.5 bg-gradient-to-r from-gold-soft/60 to-gold/40 border border-gold/50"
          >
            <span className="text-[16px]">🎁</span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-extrabold text-eye-purple">
                지금 첫 충전하면 별 +50%
              </p>
              <p className="text-[10.5px] text-eye-purple/70 mt-0.5">
                별이 부족해도 충전하면 바로 이어서 볼 수 있어
              </p>
            </div>
            <span className="text-eye-purple/60 text-[15px]">›</span>
          </Link>
        )}
      </div>
    </div>
  );
}
