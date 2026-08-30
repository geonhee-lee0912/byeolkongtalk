"use client";

// 결과 화면 최상단 재충전 블록 — 리딩 직후 따끈한 순간에 매출 CTA를 앞세운다.
// 이 고민 이어가기(-40%) + 새 고민 + (자격자) 첫충전 +20% 보너스 인라인.
import { useEffect, useState } from "react";
import Link from "next/link";
import { trackUiEvent } from "@/lib/analytics/ui-events";

export default function RechargeBlock({
  allowContinue,
  onContinue,
  showContinue = true,
  newHref,
  newLabel,
  newCostLabel,
  newDesc,
  readingId,
}: {
  allowContinue: boolean;
  onContinue?: () => void;
  /** 이어가기 CTA 노출 여부 (기본 노출; 타로 결과화면은 false — 사용률 2.3%). */
  showContinue?: boolean;
  newHref: string;
  newLabel: string;
  newCostLabel: string;
  /** 새 CTA 라벨 아래 보조 설명 (선택). */
  newDesc?: string;
  /** 계측 귀속용 reading id (선택). */
  readingId?: string;
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
        {showContinue && (
          <p className="text-[14px] font-bold text-eye-purple mb-3">
            이 고민, 더 깊이 이어가볼까?
          </p>
        )}
        {showContinue && allowContinue && onContinue && (
          <button
            onClick={() => {
              trackUiEvent("result_cta_clicked", { readingId, meta: { cta: "continue" } });
              onContinue();
            }}
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
          onClick={() => trackUiEvent("result_cta_clicked", { readingId, meta: { cta: "new" } })}
          className={`w-full py-3 rounded-xl font-bold text-[13.5px] flex items-center justify-between px-4 transition ${
            showContinue
              ? "border border-lilac-deep/40 text-lilac-deep hover:bg-lilac-deep/5"
              : "bg-lilac-deep text-white hover:bg-lilac-deep/90"
          }`}
        >
          <span className="flex flex-col min-w-0">
            <span>{newLabel}</span>
            {newDesc && (
              <span
                className={`text-[11px] font-normal mt-0.5 ${
                  showContinue ? "text-text-light/80" : "text-white/80"
                }`}
              >
                {newDesc}
              </span>
            )}
          </span>
          <span
            className={`text-[12px] shrink-0 ml-2 ${
              showContinue ? "text-text-light/80" : "text-white/80"
            }`}
          >
            {newCostLabel}
          </span>
        </Link>
        {firstChargeEligible && (
          <Link
            href="/shop"
            onClick={() => trackUiEvent("result_cta_clicked", { readingId, meta: { cta: "first_charge" } })}
            className="flex items-center gap-2.5 mt-3 rounded-xl px-3 py-2.5 bg-gradient-to-r from-gold-soft/60 to-gold/40 border border-gold/50"
          >
            <span className="text-[16px]">🎁</span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-extrabold text-eye-purple">
                지금 첫 충전하면 별 +20%
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
