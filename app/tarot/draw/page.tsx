"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SPREAD_INFO,
  getPositionLabels,
  type DrawnCard,
} from "@/lib/tarot/spreads";
import {
  TAROT_SPREAD_KEY,
  TAROT_DRAW_KEY,
  type TarotSpreadSelection,
  type TarotDrawResult,
} from "@/lib/tarot/session";
import ProgressSteps from "@/components/concern/ProgressSteps";
import StarConfirmModal from "@/components/common/StarConfirmModal";
import CardDrawRitual from "@/components/tarot/CardDrawRitual";
import RechargeSheet from "@/components/upsell/RechargeSheet";
import { RECHARGE_SOURCE } from "@/lib/analytics/recharge-source";

export default function TarotDrawPage() {
  const router = useRouter();
  const [selection, setSelection] = useState<TarotSpreadSelection | null>(null);
  const [mounted, setMounted] = useState(false);
  const [pendingDrawn, setPendingDrawn] = useState<DrawnCard[] | null>(null);
  // 별 결제 확인 팝업
  const [showConfirm, setShowConfirm] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [rechargeSheetOpen, setRechargeSheetOpen] = useState(false);

  // 선택 정보 로드 — /tarot 피커 플로우
  useEffect(() => {
    const raw =
      typeof window !== "undefined"
        ? sessionStorage.getItem(TAROT_SPREAD_KEY)
        : null;
    if (!raw) {
      router.replace("/tarot");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as TarotSpreadSelection;
      setSelection(parsed);
      setMounted(true);
    } catch {
      router.replace("/tarot");
    }
  }, [router]);

  const labels = useMemo(
    () =>
      selection
        ? getPositionLabels(
            selection.spreadType,
            selection.spreadCategory,
            selection.emotion
          )
        : [],
    [selection]
  );

  if (!selection || !mounted) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">카드를 섞는 중…</p>
      </main>
    );
  }

  const info = SPREAD_INFO[selection.spreadType];
  const accent = info.accent;
  const cardCount = info.cardCount;
  const spreadType = selection.spreadType;

  // 결제 확인 팝업 열기 + 현재 별 잔액 조회
  const openConfirm = () => {
    setShowConfirm(true);
    setBalanceLoading(true);
    setBalance(null);
    void (async () => {
      try {
        const r = await fetch("/api/stars/balance");
        const data = await r.json();
        setBalance(typeof data?.balance === "number" ? data.balance : 0);
      } catch {
        setBalance(0);
      } finally {
        setBalanceLoading(false);
      }
    })();
  };

  const goToReading = () => {
    if (!pendingDrawn) return;

    // sessionStorage 로 넘기고 /tarot/reading 이 직접 POST
    const payload: TarotDrawResult = { ...selection, drawnCards: pendingDrawn };
    sessionStorage.setItem(TAROT_DRAW_KEY, JSON.stringify(payload));
    router.push("/tarot/reading");
  };

  return (
    <main className="flex flex-1 flex-col items-center w-full">
      {/* 단계 인디케이터 */}
      <div className="mt-14 mb-8">
        <ProgressSteps current={3} />
      </div>

      <CardDrawRitual
        cardCount={cardCount}
        slotLabels={labels}
        accent={accent}
        ritualLabel={info.label}
        completeLabel="고민 상담 시작하기"
        relationshipLayout={spreadType === "relationship_5"}
        backLabel="리딩 방법 선택"
        onBack={() => router.push("/tarot")}
        onComplete={(drawn) => {
          setPendingDrawn(drawn);
          openConfirm();
        }}
      />

      {showConfirm && (
        <StarConfirmModal
          spreadLabel={info.label}
          cost={info.starCost}
          balance={balance}
          loading={balanceLoading}
          accent={accent}
          surface={RECHARGE_SOURCE.tarotDraw}
          onConfirm={goToReading}
          onCharge={() => setRechargeSheetOpen(true)}
          onClose={() => setShowConfirm(false)}
        />
      )}
      {/* 🔴 닫혀 있으면 마운트하지 않는다 — 시트는 useTossPayment 를 호출해서
          마운트만으로 /api/auth/me + 토스 SDK 초기화가 돈다. 상시 마운트하면
          공개 지면(사주 운세 설명 20개 등) 방문자 전원에게 그 비용이 걸린다. */}
      {rechargeSheetOpen && (
        <RechargeSheet
          open
          returnTo="/tarot/draw"
          need={info.starCost}
          balance={balance}
          source={RECHARGE_SOURCE.tarotDraw}
          onClose={() => setRechargeSheetOpen(false)}
        />
      )}
    </main>
  );
}
