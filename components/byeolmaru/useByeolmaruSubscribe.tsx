"use client";

import { useState } from "react";
import { BYEOLMARU_SUBSCRIPTION } from "@/lib/byeolmaru/constants";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import StarConfirmModal from "@/components/common/StarConfirmModal";

// 별마루 trial/subscribe 공유 훅 — 허브·saju·woori 세 뷰가 같은 결제 흐름을 쓴다.
// onChanged: 체험/구독 성공 후 그 뷰의 데이터 재조회(entitled 재판정). 각 뷰가 자기 refresh 를 넘긴다.
export function useByeolmaruSubscribe(onChanged: () => void) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [subBalance, setSubBalance] = useState<number | null>(null);
  const [subBalanceLoading, setSubBalanceLoading] = useState(false);

  async function startTrial() {
    trackUiEvent("byeolmaru_trial_started");
    await fetch("/api/byeolmaru/trial", { method: "POST" });
    onChanged();
  }

  function openSubscribe() {
    trackUiEvent("byeolmaru_subscribe_clicked");
    setConfirmOpen(true);
    setSubBalanceLoading(true);
    setSubBalance(null);
    void (async () => {
      try {
        const r = await fetch("/api/stars/balance", { cache: "no-store" });
        const d = r.ok ? await r.json() : null;
        setSubBalance(typeof d?.balance === "number" ? d.balance : 0);
      } catch {
        setSubBalance(0);
      } finally {
        setSubBalanceLoading(false);
      }
    })();
  }

  async function handleConfirm() {
    const res = await fetch("/api/byeolmaru/subscribe", { method: "POST" });
    if (res.status === 402) {
      window.location.href = "/shop";
      return;
    }
    if (res.ok) {
      trackUiEvent("byeolmaru_subscribe_completed", { meta: { stars: BYEOLMARU_SUBSCRIPTION.cost } });
      setConfirmOpen(false);
      onChanged();
      return;
    }
    setConfirmOpen(false);
    alert("구독이 안 됐어. 잠시 후 다시 시도해줄래?");
  }

  const subscribeModal = confirmOpen ? (
    <StarConfirmModal
      cost={BYEOLMARU_SUBSCRIPTION.cost}
      balance={subBalance}
      loading={subBalanceLoading}
      accent="#E8C26A"
      title="별마루 구독"
      subtitle="30일 동안 매일 개인화를 열어둬"
      confirmLabel="구독하기"
      onConfirm={handleConfirm}
      onCharge={() => (window.location.href = "/shop")}
      onClose={() => setConfirmOpen(false)}
    />
  ) : null;

  return { startTrial, openSubscribe, subscribeModal };
}
