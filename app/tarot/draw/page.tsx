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
import { fetchWallet } from "@/lib/wallet";
import { clearPendingDraw } from "@/lib/tarot/pending-draw";
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
  // 잔액을 읽는 중 안내 — 확인 팝업은 잔액을 읽은 뒤에 뜬다
  const [checking, setChecking] = useState(false);
  // 잔액을 못 읽었다(실패·5초 초과) — 팝업 대신 '다시 눌러줘' 한 줄. 완료 버튼을 다시 누르면(onDrawn) 지우고 다시 읽는다
  const [walletError, setWalletError] = useState(false);
  // 대화로 넘어가는 중 / 잔액 확인 중 — 완료 버튼 연타로 두 번 이동·두 번 조회하지 않게
  const leavingRef = useRef(false);
  const checkingRef = useRef(false);
  // 이 화면이 떠 있는가 — 잔액을 읽는 사이 뒤로 가기로 떠났으면 응답이 와도 대화로 끌고 가지 않는다(router.push 는 컴포넌트 수명과 무관한 전역 이동이라 떠난 뒤에도 차감된다)
  const aliveRef = useRef(false);
  useEffect(() => {
    aliveRef.current = true; // 본문에서 다시 켠다 — 개발 StrictMode 의 가짜 언마운트(cleanup 뒤 재실행) 뒤에도 영구히 꺼져 있지 않게
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // 선택 정보 로드 — /tarot(스프레드 고르기).
  useEffect(() => {
    let sel: TarotSpreadSelection | null = null;
    try {
      const raw = sessionStorage.getItem(TAROT_SPREAD_KEY);
      sel = raw ? (JSON.parse(raw) as TarotSpreadSelection) : null;
    } catch {
      sel = null;
    }

    if (!sel) {
      router.replace("/tarot");
      return;
    }
    setSelection(sel);
    setMounted(true);
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
  // price = 이 판에 보여 준(쓴) 가격(팝업 가격 · 팝업 생략이면 그 자리에서 계산한 가격) — 대화 화면이 서버에 실어 보내 서버 가격과 대조한다(다르면 차감 없이 409)
  const goToReading = (drawn: DrawnCard[], price: number) => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    // sessionStorage 로 넘기고 /tarot/reading 이 직접 POST — 필드를 골라 담는다
    const payload: TarotDrawResult = {
      spreadType: selection.spreadType,
      spreadCategory: selection.spreadCategory,
      emotion: selection.emotion,
      concern: selection.concern,
      drawnCards: drawn,
      expectedCost: price,
    };
    sessionStorage.setItem(TAROT_DRAW_KEY, JSON.stringify(payload));
    router.push("/tarot/reading");
    // 입구 반반 때 남은 진행 저장(고민 원문)도 지운다 — 홈을 거치지 않고 들어온 기기도 정리되게(lib/tarot/pending-draw.ts).
    // 이동 뒤에 둔다 — localStorage 접근 자체가 던지는 브라우저여도 풀이 시작을 막지 않게
    try {
      clearPendingDraw(localStorage);
    } catch {
      // noop
    }
  };

  // 카드를 다 뽑으면 잔액을 그 자리에서 읽는다(가격은 서버 차감과 같은 tarotPrice).
  //  - 확인 팝업 → 잔액 부족이면 충전 시트
  //    (그 팝업의 잔액 부족 노출이 paywall_shown = Meta AddToCart 원천이라 자리를 그대로 둔다)
  //  - 못 읽으면(실패·5초 초과) 팝업 없이 '다시 눌러줘' 한 줄 — 완료 버튼을 다시 누르면 다시 읽는다
  const onDrawn = (drawn: DrawnCard[]) => {
    setWalletError(false); // 다시 누름 = 다시 읽기 — 앞선 실패 줄을 지운다
    if (leavingRef.current) return; // 대화로 넘어가는 중엔 완료를 다시 눌러도(키보드 등) 지갑 조회를 또 내보내지 않는다
    setPendingDrawn(drawn);
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    const here = window.location.pathname; // 이 판을 시작한 주소 — 응답 때 달라졌으면 떠나는 중이다
    void (async () => {
      const w = await fetchWallet("tarot_draw");
      checkingRef.current = false;
      // 떠나는 중이거나 떠났으면 대화로 끌고 가지 않는다(떠난 뒤 차감 방지) — 뒤로 가기는 주소가 먼저 바뀌고 화면 정리(aliveRef)는 한 박자 늦는다
      if (!aliveRef.current || window.location.pathname !== here) {
        setChecking(false); // 언마운트면 아무 일도 안 한다 · 화면이 보존돼도(Activity) "잠시만…" 이 남지 않게
        return;
      }
      // 못 읽었다(실패·5초 초과 — 계측은 fetchWallet 의 wallet_fetch_failed) → 팝업·paywall_shown·이동 없이 '다시 눌러줘'.
      // 예전엔 잔액 0(parseWallet(null))으로 잔액 부족 팝업을 띄워, 별이 있는 유저를 충전으로 밀고 가짜 AddToCart 를 쐈다(사용자 결정 2026-10-09 B)
      if (!w) {
        setChecking(false);
        setWalletError(true);
        return;
      }
      const price = tarotPrice(spreadType);
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
            if (pendingDrawn) goToReading(pendingDrawn, cost); // 팝업이 보여 준 가격 그대로
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
      {/* fixed 덮개라 이 <main>(또는 조상)에 transform 이 남는 애니메이션(예: animate-fade-in)을 붙이면 fixed 의 기준이 화면이 아니라 그 요소가 돼 깨진다 — StarConfirmModal 이 포털을 쓰는 이유와 같다 */}
      {checking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="status"
          aria-live="polite"
        >
          <p className="px-4 py-2 rounded-full bg-white/90 text-text-light text-sm shadow-[0_4px_18px_rgba(90,62,140,0.15)]">
            잠시만…
          </p>
        </div>
      )}
      {/* 잔액 조회 실패 한 줄 — 탭을 막지 않는다(pointer-events-none) · 완료 버튼을 다시 누르면 사라지고 다시 읽는다 */}
      {walletError && (
        <div role="alert" className="fixed inset-x-0 bottom-36 z-50 flex justify-center px-4 pointer-events-none">
          <p className="rounded-full bg-white/95 px-4 py-2 text-[13px] font-bold text-eye-purple shadow-[0_4px_18px_rgba(90,62,140,0.15)]">
            잔액을 못 불러왔어 — 다시 눌러줘
          </p>
        </div>
      )}
    </main>
  );
}
