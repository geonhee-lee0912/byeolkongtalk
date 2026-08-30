"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { STAR_PACKAGES, FIRST_CHARGE_BONUS_RATE } from "@/lib/constants";
import { useTossPayment } from "@/lib/use-toss-payment";
import { trackUiEvent } from "@/lib/analytics/ui-events";

// 인챗 충전 시트는 저·중가 3종만 노출 (150·300 은 /shop 전용). 문맥상 대용량 불필요.
const INCHAT_PACKAGES = STAR_PACKAGES.filter((p) =>
  ["star_10", "star_30", "star_70"].includes(p.id)
);

interface Props {
  open: boolean;
  /** 결제 완료 후 돌아올 reading URL (예: /saju/reading?id=...) */
  returnTo: string;
  /** 현재 별 잔액 — 없으면 시트 내부에서 조회 */
  balance?: number | null;
  /** 충전 시작 직전 sessionStorage 에 저장할 upsell 정보 */
  pendingUpsell?: {
    readingId: string;
    type: "clarifier" | "extend";
  };
  onClose: () => void;
}

/**
 * 인챗 잔액 부족 시 충전 바텀시트.
 * 결제 시작 시 returnTo 로 복귀 + pending_upsell 로 원클릭 재개.
 */
export default function RechargeSheet({
  open,
  returnTo,
  balance: balanceProp,
  pendingUpsell,
  onClose,
}: Props) {
  const [balance, setBalance] = useState<number | null>(balanceProp ?? null);
  const [selectedId, setSelectedId] = useState<string>("star_30");
  const [firstChargeEligible, setFirstChargeEligible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { paymentReady, paymentError, startPayment } = useTossPayment();

  // 열릴 때 잔액 조회 + shallow history
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSelectedId("star_30"); // 추천 패키지 기본 선택
    trackUiEvent("recharge_sheet_opened", {
      readingId: pendingUpsell?.readingId,
      meta: { source: "inchat" },
    });

    // 첫 충전 보너스 자격 조회 (서버가 권위) — 자격 있을 때만 +20% 노출
    fetch("/api/stars/first-charge-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFirstChargeEligible(d?.eligible === true))
      .catch(() => {});

    // 잔액 prop 이 없으면 직접 조회
    if (balanceProp == null) {
      fetch("/api/stars/balance", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) setBalance(d.balance ?? 0); })
        .catch(() => {});
    } else {
      setBalance(balanceProp);
    }

    history.pushState({ sheet: "recharge" }, "");
    const handlePop = () => { onClose(); };
    window.addEventListener("popstate", handlePop);
    return () => {
      window.removeEventListener("popstate", handlePop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ESC + 배경 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSheet();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function closeSheet() {
    if (history.state?.sheet === "recharge") {
      history.back();
    } else {
      onClose();
    }
  }

  async function handleCharge() {
    const pkg = STAR_PACKAGES.find((p) => p.id === selectedId);
    if (!pkg || !paymentReady || loading) return;
    setLoading(true);
    setError(null);
    trackUiEvent("recharge_payment_started", {
      readingId: pendingUpsell?.readingId,
      meta: { source: "inchat", packageId: pkg.id, amountWon: pkg.price },
    });

    // 결제 시작 전 pending_upsell 저장
    if (pendingUpsell) {
      sessionStorage.setItem(
        "byeolkong:pending_upsell",
        JSON.stringify(pendingUpsell)
      );
    }

    try {
      await startPayment(pkg, { returnTo });
      // requestPayment 는 토스 결제창으로 전체 페이지 전환하므로 여기까지 오지 않음.
      // USER_CANCEL/STOP 은 false 반환(예외 없음). 네트워크 에러만 throw.
    } catch (err) {
      // 결제 시작 실패 — pending_upsell 롤백
      sessionStorage.removeItem("byeolkong:pending_upsell");
      const e = err as { message?: string };
      setError(e.message ?? "결제 시작에 실패했어. 다시 시도해줄래?");
    } finally {
      setLoading(false);
    }
  }

  if (!open || typeof document === "undefined") return null;

  const selectedPkg = STAR_PACKAGES.find((p) => p.id === selectedId);

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-night/70 backdrop-blur-sm animate-fade-in"
      onClick={closeSheet}
      role="dialog"
      aria-modal="true"
      aria-label="별 충전"
    >
      <div
        className="w-full max-w-md bg-cream rounded-t-3xl border border-lilac-mid/30 shadow-[0_-4px_24px_rgba(31,23,53,0.18)] max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 그랩바 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-lilac-mid/40 rounded-full" />
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          <h2 className="font-display text-[17px] font-bold text-eye-purple">
            별 충전하기
          </h2>
          <button
            onClick={closeSheet}
            aria-label="닫기"
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-light/70 hover:bg-lilac-soft/50"
          >
            ✕
          </button>
        </div>

        {/* 잔액 + 안내 */}
        <div className="mx-5 mb-4 px-4 py-3 rounded-xl bg-cream-warm border border-lilac-mid/20">
          <p className="text-[13px] text-eye-purple leading-relaxed">
            별이 조금 모자라
            {balance !== null ? (
              <span className="font-bold"> — 지금 잔액 ⭐{balance}</span>
            ) : null}
          </p>
          <p className="text-[11px] text-text-light mt-1 leading-snug">
            충전하면 이 대화로 바로 돌아와요
          </p>
        </div>

        {/* 첫 충전 보너스 — 자격자만. 어떤 패키지든 첫 결제에 +20% */}
        {firstChargeEligible && (
          <div className="mx-5 mb-4 -mt-1 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-gold-soft/60 to-gold/40 border border-gold/50">
            <span className="text-[15px]">🎁</span>
            <p className="text-[12px] font-extrabold text-eye-purple">
              지금 첫 충전이면 별 <span className="tabular-nums">+20%</span> 더 얹어줘
            </p>
          </div>
        )}

        {/* 패키지 목록 */}
        <div className="px-5 flex flex-col gap-2 pb-2">
          {INCHAT_PACKAGES.map((pkg) => {
            const isSelected = selectedId === pkg.id;
            const isRecommended = pkg.id === "star_30";
            const bonus = firstChargeEligible
              ? Math.round(pkg.stars * FIRST_CHARGE_BONUS_RATE)
              : 0;
            return (
              <button
                key={pkg.id}
                type="button"
                onClick={() => {
                  setSelectedId(pkg.id);
                  trackUiEvent("recharge_package_selected", {
                    readingId: pendingUpsell?.readingId,
                    meta: { source: "inchat", packageId: pkg.id },
                  });
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition text-left ${
                  isSelected
                    ? "border-lilac-deep bg-lilac-soft/30 shadow-[0_0_0_2px_rgba(159,138,208,0.15)]"
                    : "border-lilac-mid/30 bg-white hover:border-lilac/70"
                } ${isRecommended ? "ring-1 ring-gold/40" : ""}`}
              >
                <span className="text-[16px] shrink-0">⭐</span>
                <div className="flex-1 min-w-0">
                  <span className="text-[14px] font-black text-eye-purple tabular-nums">
                    {pkg.stars}별
                    {bonus > 0 && (
                      <span className="ml-1 text-[12px] font-black text-gold tabular-nums">
                        +{bonus}
                      </span>
                    )}
                    {isRecommended && (
                      <span className="ml-2 text-[10px] font-black text-gold bg-gold/10 px-1.5 py-0.5 rounded-full">
                        추천
                      </span>
                    )}
                  </span>
                  <span className="ml-2 text-[12px] text-text-light tabular-nums">
                    {pkg.price.toLocaleString()}원
                  </span>
                </div>
                <span
                  className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                    isSelected ? "bg-lilac-deep" : "bg-cream border border-lilac-mid/40"
                  }`}
                  aria-hidden
                >
                  {isSelected && (
                    <svg
                      width="9"
                      height="9"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="2.5 6.5 5 9 9.5 3.5" />
                    </svg>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {(error || paymentError) && (
          <p className="text-[12px] text-red-500 text-center px-5 mt-2 mb-1">
            {error ?? "결제 모듈을 불러오지 못했어. 새로고침해줘."}
          </p>
        )}

        {/* CTA */}
        <div className="px-5 pb-6 pt-3">
          <button
            onClick={() => void handleCharge()}
            disabled={loading || !paymentReady || !selectedPkg}
            className="w-full py-3.5 bg-lilac-deep text-white rounded-full text-[14px] font-bold shadow-md hover:bg-lilac-deep/90 transition-all disabled:opacity-60 flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <span>⭐</span>
            <span className="tabular-nums">
              {!paymentReady && !paymentError
                ? "잠시만, 결제 준비 중..."
                : selectedPkg
                ? `${selectedPkg.stars}별 · ${selectedPkg.price.toLocaleString()}원 결제하기`
                : "패키지를 골라줘"}
            </span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
