"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { tarotPrice } from "@/lib/tarot/pricing";
import { spendConsent } from "@/lib/tarot/menu-session";
import { fetchWallet, parseWallet } from "@/lib/wallet";
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
  // 별 결제 확인 팝업 — 가격·잔액은 뽑기가 끝난 순간 서버에서 다시 읽어 정한다
  const [showConfirm, setShowConfirm] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [rechargeSheetOpen, setRechargeSheetOpen] = useState(false);
  // 잔액·그룹을 읽는 중 안내 — prod 는 확인 팝업을 바로 띄워 '…' 를 보였지만 이제 팝업은 그룹 가격을 읽은 뒤에 뜬다(다른 곳 #8)
  const [checking, setChecking] = useState(false);
  // 대화로 넘어가는 중 / 잔액 확인 중 — 완료 버튼 연타로 두 번 이동·두 번 조회하지 않게
  const leavingRef = useRef(false);
  const checkingRef = useRef(false);

  // 선택 정보 로드 — /tarot(메뉴판 또는 옛 스프레드 고르기) 또는 맛보기 끝 "이어서 깊게"
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

  // 뽑은 카드는 인자로 받는다 — setPendingDrawn 직후의 state 는 아직 옛 값이다
  const goToReading = (drawn: DrawnCard[]) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    // 동의는 한 판에 한 번 — 이 판을 시작하는 모든 길(팝업 생략·팝업 확인)에서 여기서 소모한다.
    // 뒤로 가 다시 뽑으면 확인 팝업이 다시 뜬다(Task 4·8 리뷰). 충전 경로는 여기를 안 거쳐 동의가 남는다.
    if (selection.consented) setSelection(spendConsent(sessionStorage, selection));
    // sessionStorage 로 넘기고 /tarot/reading 이 직접 POST — 동의 표시는 대화로 넘기지 않는다(필드를 골라 담는다)
    const payload: TarotDrawResult = {
      spreadType: selection.spreadType,
      spreadCategory: selection.spreadCategory,
      emotion: selection.emotion,
      concern: selection.concern,
      drawnCards: drawn,
    };
    sessionStorage.setItem(TAROT_DRAW_KEY, JSON.stringify(payload));
    router.push("/tarot/reading");
  };

  // 카드를 다 뽑으면 잔액·반반 그룹을 그 자리에서 읽어 이번 판 가격을 정한다(서버 차감과 같은 tarotPrice).
  //  - 메뉴판에서 동의한 선택(consented — 메뉴판 그룹만 심는다)이고 잔액이 충분하면 확인 팝업 없이 바로 대화로(스펙 §4)
  //  - 그 밖(옛 그룹 = 지금 prod 흐름 · 잔액 부족 · 못 읽음)은 확인 팝업 → 잔액 부족이면 충전 시트
  //    (그 팝업의 잔액 부족 노출이 paywall_shown = Meta AddToCart 원천이라 자리를 그대로 둔다)
  //  못 읽으면 지금 prod 와 같은 실패 모양(잔액 0 → 잔액 부족 팝업) — 서버가 차감 때 다시 판단한다
  const onDrawn = (drawn: DrawnCard[]) => {
    setPendingDrawn(drawn);
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    void (async () => {
      const w = (await fetchWallet()) ?? parseWallet(null);
      checkingRef.current = false;
      const price = tarotPrice(spreadType, w.menuArm);
      if (selection.consented && w.balance >= price) {
        goToReading(drawn); // 동의 소모는 goToReading 안에서 · 안내(checking)는 화면이 넘어갈 때까지 켜 둔다
        return;
      }
      setChecking(false);
      setCost(price);
      setBalance(w.balance);
      setShowConfirm(true);
    })();
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
        onComplete={onDrawn}
      />

      {showConfirm && cost !== null && (
        <StarConfirmModal
          spreadLabel={info.label}
          cost={cost}
          balance={balance}
          loading={false}
          accent={accent}
          surface={RECHARGE_SOURCE.tarotDraw}
          onConfirm={() => {
            if (pendingDrawn) goToReading(pendingDrawn);
          }}
          onCharge={() => setRechargeSheetOpen(true)}
          onClose={() => setShowConfirm(false)}
        />
      )}
      {/* 🔴 닫혀 있으면 마운트하지 않는다 — 시트는 useTossPayment 를 호출해서
          마운트만으로 /api/auth/me + 토스 SDK 초기화가 돈다. 상시 마운트하면
          공개 지면(사주 운세 설명 20개 등) 방문자 전원에게 그 비용이 걸린다. */}
      {rechargeSheetOpen && cost !== null && (
        <RechargeSheet
          open
          returnTo="/tarot/draw"
          need={cost}
          balance={balance}
          source={RECHARGE_SOURCE.tarotDraw}
          onClose={() => setRechargeSheetOpen(false)}
        />
      )}
      {checking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          aria-live="polite"
          aria-busy="true"
        >
          <p className="px-4 py-2 rounded-full bg-white/90 text-text-light text-sm shadow-[0_4px_18px_rgba(90,62,140,0.15)]">
            잠시만…
          </p>
        </div>
      )}
    </main>
  );
}
