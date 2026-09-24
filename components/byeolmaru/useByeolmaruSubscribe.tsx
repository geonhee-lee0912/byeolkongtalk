"use client";

import { useState } from "react";
import { BYEOLMARU_SUBSCRIPTION } from "@/lib/byeolmaru/constants";
import { trackUiEvent } from "@/lib/analytics/ui-events";
import StarConfirmModal from "@/components/common/StarConfirmModal";
import { BAIT, BAIT_SLOTS } from "@/lib/byeolmaru/bait";

// 별마루 trial/subscribe 공유 훅 — 허브·saju·woori 세 뷰가 같은 결제 흐름을 쓴다.
// onChanged: 체험/구독 성공 후 그 뷰의 데이터 재조회(entitled 재판정). 각 뷰가 자기 refresh 를 넘긴다.
export function useByeolmaruSubscribe(onChanged: () => void) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [subBalance, setSubBalance] = useState<number | null>(null);
  const [subBalanceLoading, setSubBalanceLoading] = useState(false);

  // slot 은 호출부가 아는 "어느 미끼에서 눌렀는가"다(P5-4 §13) — 옵셔널이라 슬롯을 모르는
  // 기존 호출부(PairDayDetailCard 등, 인자 없이 호출)는 그대로 slot 없이 찍힌다.
  async function startTrial(slot?: string) {
    trackUiEvent("byeolmaru_trial_started", slot ? { meta: { slot } } : undefined);
    await fetch("/api/byeolmaru/trial", { method: "POST" });
    onChanged();
  }

  function openSubscribe(slot?: string) {
    trackUiEvent("byeolmaru_subscribe_clicked", slot ? { meta: { slot } } : undefined);
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
      // 구독 시트 전용 — 전체 가치 3종 + 가격을 여기서 한 번 크게(스펙 §9). 카피는 BAIT(허브·
      // 상세뷰 미끼 문구)에서 그대로 끌어와 중복 저작을 피한다.
      // 안심 문구는 스펙 원안("체험 중엔 별이 안 나가")을 안 쓴다 — 여기 오는 사람은 전원 이미
      // 체험을 쓴 뒤라(PaywallCut·HubBanner 모두 onSubscribe 는 trialUsed=true 에서만
      // 연결) 체험 안내가 대상에 안 맞는다. 대신 실제로 궁금할 사실 — 자동갱신 없음 — 을 답한다
      // (purchase_byeolmaru_subscription 은 1회성 20별 차감, 정기결제 아님).
      extra={
        <div className="border-t border-lilac-mid/20 pt-4 mb-5">
          <ul className="space-y-1 mb-3">
            {BAIT_SLOTS.map((slot) => (
              <li key={slot} className="flex items-start gap-1.5 text-[13px] leading-snug">
                <span aria-hidden className="text-eye-purple shrink-0">✦</span>
                <span>
                  <span className="font-medium text-eye-purple">{BAIT[slot].title}</span>
                  <span className="text-eye-purple/85 text-[12px]"> · {BAIT[slot].chips[0]}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-center font-display text-xl font-bold text-eye-purple">
            {BYEOLMARU_SUBSCRIPTION.cost}별 / {BYEOLMARU_SUBSCRIPTION.days}일
          </p>
          <p className="mt-2 text-center text-[11px] text-eye-purple/85">
            30일 지나면 그냥 끝나 — 자동으로 또 빠져나가지 않아.
          </p>
        </div>
      }
      onConfirm={handleConfirm}
      onCharge={() => (window.location.href = "/shop")}
      onClose={() => setConfirmOpen(false)}
    />
  ) : null;

  return { startTrial, openSubscribe, subscribeModal };
}
