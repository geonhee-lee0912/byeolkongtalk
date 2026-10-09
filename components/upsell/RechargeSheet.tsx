"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { STAR_PACKAGES } from "@/lib/constants";
import {
  sheetPackages,
  pickDefaultPackage,
  leftoverAfter,
  receivedStars,
  firstChargeBonusPercent,
} from "@/lib/recharge-default";
import { fetchWallet, parseWallet } from "@/lib/wallet";
import type { MenuArm } from "@/lib/tarot/menu-ab";
import { useTossPayment } from "@/lib/use-toss-payment";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import type { RechargeSource } from "@/lib/analytics/recharge-source";

interface Props {
  open: boolean;
  /** 결제 완료 후 돌아올 reading URL (예: /saju/reading?id=...) */
  returnTo: string;
  /** 현재 별 잔액 — 없으면 시트 내부에서 조회 */
  balance?: number | null;
  /**
   * 하려는 것의 가격(별). 알면 부족분에 맞춰 기본 선택을 정하고(lib/recharge-default)
   * 각 줄에 "충전 후 ⭐N 남아" 를 보여준다. 모르면 기존 기본값(star_30)·표시 없음.
   */
  need?: number | null;
  /** 충전 시작 직전 sessionStorage 에 저장할 upsell 정보 */
  pendingUpsell?: {
    readingId: string;
    type: "clarifier" | "extend";
  };
  /**
   * 계측 귀속 지면.
   * 🔴 **required 다 — 기본값을 두지 않는다.** 로드맵 KPI(`roadmap-kpi-snapshot.sql`·
   *    `admin_roadmap_kpi`)가 `meta->>'source' = 'inchat'` 으로 명시 필터하는데, optional 이면
   *    새 호출부가 깜빡해도 컴파일러가 못 잡고 조용히 인챗 지표에 섞인다. 명시를 강제해서
   *    그 실수를 컴파일 단계에서 끊는다(2026-10-02, 코드 리뷰 지적).
   */
  source: RechargeSource;
  onClose: () => void;
}

/**
 * 잔액 부족 시 그 자리에 뜨는 충전 바텀시트.
 * 결제 시작 시 returnTo 로 복귀 + pending_upsell 로 원클릭 재개(인챗 전용).
 *
 * 대화 중(연장·되묻기)과 구매 지점(스프레드 뽑기·사주 리포트·궁합·타로 리포트) 양쪽에서 쓴다 —
 * 문구는 두 맥락에 다 맞아야 한다("이 대화로" 같은 인챗 전용 표현 금지).
 */
export default function RechargeSheet({
  open,
  returnTo,
  balance: balanceProp,
  need = null,
  pendingUpsell,
  source,
  onClose,
}: Props) {
  const [balance, setBalance] = useState<number | null>(balanceProp ?? null);
  // 반반 비교 그룹 — 시트 칸이 그룹마다 다르다(메뉴판 10·30·55·70 / 옛 10·30·70). 열릴 때 읽는다
  const [arm, setArm] = useState<MenuArm | null>(null);
  const [selectedId, setSelectedId] = useState<string>("star_30");
  const [firstChargeEligible, setFirstChargeEligible] = useState(false);
  // 자격 조회가 끝났는지 — 기본 선택은 잔액·자격이 다 정해진 뒤 한 번만 정한다
  const [eligibilityLoaded, setEligibilityLoaded] = useState(false);
  // '추천' 배지·금테 대상 = 이번에 기본으로 고른 패키지(기본 star_30)
  const [recommendedId, setRecommendedId] = useState<string>("star_30");
  // 사용자가 직접 고른 뒤에는 늦게 온 잔액/자격 응답으로 덮어쓰지 않는다
  const userPickedRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { paymentReady, paymentError, startPayment } = useTossPayment();

  // 열릴 때 잔액 조회 + shallow history
  useEffect(() => {
    if (!open) {
      // 닫힐 때 비워 둔다 — 상시 마운트 호출부(reading 화면)에서 다시 열 때 지난번 자격·잔액으로 고르지 않게
      setArm(null);
      setEligibilityLoaded(false);
      if (balanceProp == null) setBalance(null);
      return;
    }
    setError(null);
    setSelectedId("star_30"); // 부족분 모르면 이 값 유지
    setRecommendedId("star_30");
    setEligibilityLoaded(false);
    userPickedRef.current = false;
    trackUiEvent("recharge_sheet_opened", {
      readingId: pendingUpsell?.readingId,
      meta: { source, need, balance: balanceProp ?? null },
    });

    // 첫 충전 보너스 자격 조회 (서버가 권위) — 자격 있을 때만 +20% 노출
    fetch("/api/stars/first-charge-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFirstChargeEligible(d?.eligible === true))
      .catch(() => {})
      .finally(() => setEligibilityLoaded(true));

    // 잔액(prop 이 없을 때)과 반반 그룹을 함께 읽는다. 못 읽으면 옛 그룹(지금 prod) 칸 —
    // 결제 준비·승인은 두 그룹 패키지를 다 받으니(lib/constants.ts STAR_PACKAGES) 결제는 그대로 된다
    if (balanceProp != null) setBalance(balanceProp);
    void fetchWallet().then((w) => {
      setArm((w ?? parseWallet(null)).menuArm);
      if (balanceProp == null && w) setBalance(w.balance);
    });

    history.pushState({ sheet: "recharge" }, "");
    const handlePop = () => { onClose(); };
    window.addEventListener("popstate", handlePop);
    return () => {
      window.removeEventListener("popstate", handlePop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 잔액·자격이 다 정해지면 부족분 맞춤 기본값을 한 번 적용
  useEffect(() => {
    if (!open || !eligibilityLoaded || !arm || userPickedRef.current) return;
    const picked = pickDefaultPackage({
      need,
      balance,
      bonusEligible: firstChargeEligible,
      packages: sheetPackages(arm),
    });
    const next = picked ?? "star_30";
    setSelectedId(next);
    setRecommendedId(next);
  }, [open, eligibilityLoaded, arm, balance, firstChargeEligible, need]);

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
      meta: { source, packageId: pkg.id, amountWon: pkg.price },
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
            충전하면 보던 자리로 바로 돌아와요
          </p>
        </div>

        {/* 첫 충전 보너스 — 자격자만. 어떤 패키지든 첫 결제에 +20% */}
        {firstChargeEligible && (
          <div className="mx-5 mb-4 -mt-1 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-gold-soft/60 to-gold/40 border border-gold/50">
            <span className="text-[15px]">🎁</span>
            <p className="text-[12px] font-extrabold text-eye-purple">
              지금 첫 충전이면 별 <span className="tabular-nums">+{firstChargeBonusPercent()}%</span> 더 얹어줘
            </p>
          </div>
        )}

        {/* 패키지 목록 — 반반 그룹을 읽기 전엔 자리만(칸 수가 그룹마다 달라 깜빡이지 않게) */}
        <div className="px-5 flex flex-col gap-2 pb-2">
          {arm === null &&
            [0, 1, 2].map((i) => (
              <div
                key={i}
                aria-hidden
                className="h-[52px] rounded-xl border-2 border-lilac-mid/20 bg-white/60 animate-pulse"
              />
            ))}
          {arm !== null && sheetPackages(arm).map((pkg) => {
            const isSelected = selectedId === pkg.id;
            const isRecommended = pkg.id === recommendedId;
            const bonus = receivedStars(pkg, firstChargeEligible) - pkg.stars;
            const leftover =
              need != null && balance !== null && eligibilityLoaded
                ? leftoverAfter({ need, balance, pkg, bonusEligible: firstChargeEligible })
                : null;
            return (
              <button
                key={pkg.id}
                type="button"
                onClick={() => {
                  userPickedRef.current = true;
                  setSelectedId(pkg.id);
                  trackUiEvent("recharge_package_selected", {
                    readingId: pendingUpsell?.readingId,
                    meta: { source, packageId: pkg.id },
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
                  {leftover !== null && (
                    <span
                      className={`block mt-0.5 text-[11px] tabular-nums ${
                        leftover >= 0 ? "text-eye-purple/80" : "text-text-light/60"
                      }`}
                    >
                      {leftover > 0
                        ? `충전 후 이번 판 하고도 ⭐${leftover} 남아`
                        : leftover === 0
                        ? "충전하면 이번 판에 딱 맞아"
                        : `⭐${-leftover} 모자라`}
                    </span>
                  )}
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
            disabled={loading || !paymentReady || !selectedPkg || arm === null}
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
