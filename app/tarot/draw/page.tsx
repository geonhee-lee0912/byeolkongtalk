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

export default function TarotDrawPage() {
  const router = useRouter();
  const [selection, setSelection] = useState<TarotSpreadSelection | null>(null);
  const [mounted, setMounted] = useState(false);
  const [pendingDrawn, setPendingDrawn] = useState<DrawnCard[] | null>(null);
  // 별 결제 확인 팝업
  const [showConfirm, setShowConfirm] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // 선택 정보 로드
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
        ? getPositionLabels(selection.spreadType, selection.spreadCategory)
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
        onBack={() => router.push("/select")}
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
          onConfirm={goToReading}
          onCharge={() => router.push("/shop")}
          onClose={() => setShowConfirm(false)}
        />
      )}
    </main>
  );
}
