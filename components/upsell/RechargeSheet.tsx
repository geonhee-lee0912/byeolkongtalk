"use client";

import { useEffect, useRef, useState } from "react";
import Sheet from "@/components/common/Sheet";
import { STAR_PACKAGES, type StarPackage } from "@/lib/constants";
import {
  sheetPackages,
  pickDefaultPackage,
  leftoverAfter,
  receivedStars,
  firstChargeBonusPercent,
} from "@/lib/recharge-default";
import { fetchWallet } from "@/lib/wallet";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import type { RechargeSource } from "@/lib/analytics/recharge-source";
import Icon from "@/components/common/Icon";
import { useStorePurchase } from "@/components/shop/useStorePurchase";
import TossPaymentBridge, { type TossPayment } from "@/components/shop/TossPaymentBridge";
import { IAP_NOTICE, iapResultNotice } from "@/lib/app-iap";
import { appHaptic } from "@/lib/app-context";
import { safeInternalPath } from "@/lib/safe-internal-path";

const SHEET_PKG_IDS = sheetPackages().map((p) => p.id);

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

/** 결제가 끝나 돌아온 화면이 원클릭 재개를 띄우도록 남긴다(토스·앱 결제 공용 — 읽는 쪽은 사주·타로 읽기 화면) */
function savePendingUpsell(pendingUpsell: Props["pendingUpsell"]) {
  if (pendingUpsell) {
    sessionStorage.setItem(
      "byeolkong:pending_upsell",
      JSON.stringify(pendingUpsell)
    );
  }
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
  // 토스 결제 상태 — 브라우저에서만 붙는 TossPaymentBridge 가 채운다(앱 안에선 늘 null, 토스 SDK 가 안 뜬다)
  const [toss, setToss] = useState<TossPayment | null>(null);
  const paymentReady = toss?.paymentReady ?? false;
  const paymentError = toss?.paymentError ?? null;
  // 앱 안 = 스토어 결제(스펙 2026-11-23-앱-결제 §5). 앱 안에선 토스 결제창을 그리지 않는다(애플 3.1.1)
  const store = useStorePurchase(SHEET_PKG_IDS);
  const storePath = store.channel === "store" || store.channel === "update";
  const [storeNotice, setStoreNotice] = useState<string | null>(null);

  // 열릴 때 잔액 조회 + shallow history
  useEffect(() => {
    if (!open) {
      // 닫힐 때 비워 둔다 — 상시 마운트 호출부(reading 화면)에서 다시 열 때 지난번 자격·잔액으로 고르지 않게
      setEligibilityLoaded(false);
      if (balanceProp == null) setBalance(null);
      return;
    }
    setError(null);
    setStoreNotice(null);
    // 앱 안에서 지난번에 가격을 못 받았으면 다시 묻는다(시트는 늘 붙어 있어 마운트 때 한 번뿐이라 '다시 열어줘' 가 빈말이 된다)
    store.retryPrices();
    setSelectedId("star_30"); // 부족분 모르면 이 값 유지
    setRecommendedId("star_30");
    setEligibilityLoaded(false);
    userPickedRef.current = false;
    trackUiEvent("recharge_sheet_opened", {
      readingId: pendingUpsell?.readingId,
      meta: { source, need, balance: balanceProp ?? null },
    });

    // 응답 전에 닫히면(또는 StrictMode 첫 회 cleanup) 늦게 온 응답이 닫힘 분기가 비운 상태를 되살리지 못하게 한다
    let alive = true;

    // 첫 충전 보너스 자격 조회 (서버가 권위) — 자격 있을 때만 +20% 노출
    fetch("/api/stars/first-charge-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setFirstChargeEligible(d?.eligible === true); })
      .catch(() => {})
      .finally(() => { if (alive) setEligibilityLoaded(true); });

    // 잔액(prop 이 없을 때)을 읽는다(lib/wallet — 실패는 wallet_fetch_failed 로 계측). 칸은 고정(sheetPackages)이라 기다리지 않는다
    if (balanceProp != null) setBalance(balanceProp);
    void fetchWallet("recharge_sheet").then((w) => {
      if (!alive) return;
      if (balanceProp == null && w) setBalance(w.balance);
    });

    history.pushState({ sheet: "recharge" }, "");
    const handlePop = () => { onClose(); };
    window.addEventListener("popstate", handlePop);
    return () => {
      alive = false;
      window.removeEventListener("popstate", handlePop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 잔액·자격이 다 정해지면 부족분 맞춤 기본값을 한 번 적용
  useEffect(() => {
    if (!open || !eligibilityLoaded || userPickedRef.current) return;
    const picked = pickDefaultPackage({
      need,
      balance,
      bonusEligible: firstChargeEligible,
      packages: sheetPackages(),
    });
    const next = picked ?? "star_30";
    setSelectedId(next);
    setRecommendedId(next);
  }, [open, eligibilityLoaded, balance, firstChargeEligible, need]);

  // ESC·배경 스크롤 잠금은 공통 Sheet

  function closeSheet() {
    if (history.state?.sheet === "recharge") {
      history.back();
    } else {
      onClose();
    }
  }

  async function handleCharge() {
    const pkg = STAR_PACKAGES.find((p) => p.id === selectedId);
    if (!pkg || !toss || !paymentReady || loading) return;
    setLoading(true);
    setError(null);
    trackUiEvent("recharge_payment_started", {
      readingId: pendingUpsell?.readingId,
      meta: { source, packageId: pkg.id, amountWon: pkg.price },
    });

    // 결제 시작 전 pending_upsell 저장
    savePendingUpsell(pendingUpsell);

    try {
      await toss.startPayment(pkg, { returnTo });
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

  // 앱 안 스토어 결제 — 성공은 토스 성공과 같이: pending_upsell 을 남기고 돌아갈 자리로 새로 연다
  // (화면들이 잔액·재개 배너를 다시 읽는다. 시트만 닫으면 '모자라' 표시·재개가 옛 잔액에 머문다). 취소 = 말 없이 · 대기·실패 = 안내 한 줄
  async function handleStoreCharge() {
    const pkg = STAR_PACKAGES.find((p) => p.id === selectedId);
    if (!pkg || !store.inApp || store.busyId) return;
    setError(null);
    setStoreNotice(null);
    trackUiEvent("recharge_payment_started", {
      readingId: pendingUpsell?.readingId,
      meta: { source, packageId: pkg.id, amountWon: pkg.price, via: "iap" },
    });
    const r = await store.buy(pkg.id);
    if (r.ok) {
      appHaptic("success"); // 상점 완료 화면과 같은 진동(앱 caps ui) — 토스는 상점 완료 화면을 거쳐 돌아오며 그쪽이 진동한다
      savePendingUpsell(pendingUpsell);
      window.dispatchEvent(new Event("byeolkong:balance-updated"));
      // 토스 성공과 같은 자리 — returnTo(검증), 없으면 상점 완료 화면
      window.location.replace(safeInternalPath(returnTo) ?? "/shop?status=success");
    } else {
      setStoreNotice(iapResultNotice(r));
    }
  }

  // 브라우저면 시트가 닫혀 있어도 붙여 둔다 — 읽기 화면은 시트를 늘 붙여 두고 open 만 바꾸므로, 열기 전에 토스 준비(로그인 확인·SDK)가 끝나 있던 예전 동작 그대로
  const tossBridge = store.channel === "toss" && <TossPaymentBridge onChange={setToss} />;

  if (!open || typeof document === "undefined") return <>{tossBridge}</>;

  const selectedPkg = STAR_PACKAGES.find((p) => p.id === selectedId);
  const priceText = (pkg: StarPackage) => (storePath ? store.prices?.[pkg.id] ?? "…" : `${pkg.price.toLocaleString()}원`);
  const storeLine =
    store.channel === "update"
      ? IAP_NOTICE.update
      : store.channel === "store" && store.pricesFailed
      ? IAP_NOTICE.pricesUnavailable
      : storePath
      ? storeNotice
      : null;

  // 손잡이는 공통 Sheet(앱만) — 웹 전용 손잡이 막대는 뺐다(끌 수 없어서)
  return (
    <>
    {tossBridge}
    <Sheet
      label="별 충전"
      onClose={closeSheet}
      z={90}
      align="bottom"
      backdropClassName="bg-night/50 backdrop-blur-sm"
      panelClassName="bg-cream rounded-t-3xl border border-lilac-mid/30 shadow-float-up max-h-[85vh] overflow-y-auto"
    >
        {/* 헤더 — 제목 + 한 줄(잔액·돌아옴). 안내 상자·웹 손잡이·닫기 ✕ 는 뺐다(디자인 다듬기 묶음 2 충전 시트 B안, 운영자 11-15).
            닫기는 바깥 누르기·앱 끌어내리기·Esc·뒤로 */}
        <div className="px-5 pt-5 pb-3">
          <h2 className="font-display text-17 text-eye-purple">별 충전하기</h2>
          <p className="text-13 text-text-light mt-0.5">
            {balance !== null && (
              <>
                지금 <Icon name="star" size={14} className="inline align-[-2px] mx-0.5" />
                {balance.toLocaleString("ko-KR")} ·{" "}
              </>
            )}
            충전하면 보던 자리로 바로 돌아와
          </p>
        </div>

        {/* 첫 충전 보너스 — 자격자만. 어떤 패키지든 첫 결제에 +20% */}
        {firstChargeEligible && (
          <div className="mx-5 mb-3 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gold-wash">
            <Icon name="gift" size={16} />
            <p className="text-12 font-bold text-eye-purple">
              첫 충전이라 별 <span className="tabular-nums">+{firstChargeBonusPercent()}%</span> 더 얹어줘
            </p>
          </div>
        )}

        {/* 패키지 목록 — 별 수·첫 충전 보너스·추천은 왼쪽, 값은 오른쪽 끝. 고른 줄은 보라 2px 테두리(동그라미 없음) */}
        <div className="px-5 flex flex-col gap-2 pb-2">
          {sheetPackages().map((pkg) => {
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
                aria-pressed={isSelected}
                onClick={() => {
                  userPickedRef.current = true;
                  setSelectedId(pkg.id);
                  trackUiEvent("recharge_package_selected", {
                    readingId: pendingUpsell?.readingId,
                    meta: { source, packageId: pkg.id },
                  });
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white text-left transition ${
                  isSelected ? "border-2 border-accent" : "border border-lilac-mid/35 hover:border-lilac-mid/70"
                }`}
              >
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center text-16 font-extrabold text-eye-purple tabular-nums">
                      <Icon name="star" size={16} className="mr-0.5" />
                      {pkg.stars}
                    </span>
                    {bonus > 0 && (
                      <span className="text-12 font-bold text-[#A7731A] tabular-nums">+{bonus} 첫 충전</span>
                    )}
                    {isRecommended && (
                      <span className="text-11 font-bold text-accent bg-lilac-soft/70 px-1.5 py-0.5 rounded-full">추천</span>
                    )}
                  </span>
                  {leftover !== null && (
                    <span className="block mt-0.5 text-12 text-text-light tabular-nums">
                      {leftover > 0 ? (
                        <>
                          충전 후 이번 판 하고도 <Icon name="star" size={13} className="inline align-[-2px] mx-0.5" />
                          {leftover} 남아
                        </>
                      ) : leftover === 0 ? (
                        "충전하면 이번 판에 딱 맞아"
                      ) : (
                        <>
                          <Icon name="star" size={13} className="inline align-[-2px] mr-0.5" />
                          {-leftover} 모자라
                        </>
                      )}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-15 font-extrabold text-eye-purple tabular-nums">
                  {priceText(pkg)}
                </span>
              </button>
            );
          })}
        </div>

        {(error || paymentError) && (
          <p className="text-12 text-red-500 text-center px-5 mt-2 mb-1">
            {error ?? "결제 모듈을 불러오지 못했어. 새로고침해줘."}
          </p>
        )}

        {/* 앱 안 결제 안내(업데이트 필요·가격 못 받음·승인 대기·실패) — 웹 결제를 가리키지 않는다 */}
        {storeLine && (
          <p className="text-12 text-text-light text-center px-5 mt-2 mb-1 break-keep">{storeLine}</p>
        )}

        {/* CTA */}
        <div className="px-5 pb-6 pt-3">
          {store.channel === "toss" && (
            <button
              onClick={() => void handleCharge()}
              disabled={loading || !paymentReady || !selectedPkg}
              className="btn btn-primary btn-lg"
            >
              <span className="inline-flex items-center tabular-nums">
                {!paymentReady && !paymentError ? (
                  "잠시만, 결제 준비 중..."
                ) : selectedPkg ? (
                  <>
                    <Icon name="star" size={16} className="mr-0.5" />
                    {selectedPkg.stars} · {selectedPkg.price.toLocaleString()}원 결제하기
                  </>
                ) : (
                  "패키지를 골라줘"
                )}
              </span>
            </button>
          )}
          {/* 하이드레이션 첫 그림(pending)은 토스 준비 중과 같은 모양 · 앱은 스토어 가격을 받고 로그인이 확인돼야 누를 수 있다 */}
          {store.channel !== "toss" && (
            <button
              onClick={() => void handleStoreCharge()}
              disabled={
                !selectedPkg ||
                !store.inApp ||
                !store.prices?.[selectedPkg.id] ||
                store.signedIn !== true ||
                !!store.busyId
              }
              className="btn btn-primary btn-lg"
            >
              <span className="inline-flex items-center tabular-nums">
                {store.channel === "pending" ? (
                  "잠시만, 결제 준비 중..."
                ) : selectedPkg ? (
                  <>
                    <Icon name="star" size={16} className="mr-0.5" />
                    {selectedPkg.stars} · {priceText(selectedPkg)} 결제하기
                  </>
                ) : (
                  "패키지를 골라줘"
                )}
              </span>
            </button>
          )}
        </div>
    </Sheet>
    </>
  );
}
