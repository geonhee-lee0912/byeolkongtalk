"use client";

// 패스 구매 확인 팝업 — PassPanel 에서 플랜 탭 시 즉시구매 대신 이 확인 단계를 거친다.
// 포털·배경막·ESC·스크롤 잠금은 공통 Sheet(구매 중엔 닫기 불가).
import { useState } from "react";
import Sheet from "@/components/common/Sheet";
import OverlayCloseButton from "@/components/common/OverlayCloseButton";
import { useRouter } from "next/navigation";
import {
  DAILY_TURN_CAP,
  EXTEND_COST,
  EXTEND_TURNS,
  type PassPlan,
} from "@/lib/relationship/types";
import ButtonDots from "@/components/common/ButtonDots";
import Icon from "@/components/common/Icon";

interface PassConfirmModalProps {
  relationshipId: string;
  plan: PassPlan;
  onClose: () => void;
  /** 구매 성공 — 부모가 모달을 닫고 상태를 새로고침하도록 알림 */
  onPurchased: () => void;
}

export default function PassConfirmModal({
  relationshipId,
  plan,
  onClose,
  onPurchased,
}: PassConfirmModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/relationship/pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relationshipId, kind: plan.kind }),
      });
      if (res.status === 402) {
        router.push("/shop");
        return;
      }
      if (!res.ok) {
        setError("구매가 안 됐어. 잠시 후 다시 시도해줄래?");
        return;
      }
      onPurchased();
    } catch {
      setError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet
      label={`${plan.label} 구매할까?`}
      onClose={onClose}
      dismissible={!loading}
      z={100}
      backdropClassName="bg-night/50 backdrop-blur-sm"
      panelClassName="bg-cream rounded-t-3xl sm:rounded-3xl border border-lilac-mid/30 shadow-float-up sm:shadow-modal p-6 pb-[max(env(safe-area-inset-bottom),24px)] sm:pb-6"
    >
        <div className="text-center mb-5">
          <p className="font-display text-17 font-bold text-eye-purple">
            {plan.label} 구매할까?
          </p>
          <p className="mt-1.5 text-17 font-bold text-accent">
            <Icon name="star" size={14} className="inline align-[-2px] mr-0.5" />{plan.cost}별 차감
          </p>
        </div>

        <div className="rounded-xl border border-gold/50 bg-gold-soft/20 p-3 mb-5">
          <p className="text-12 text-eye-purple leading-relaxed">
            하루 <b>{DAILY_TURN_CAP}번</b> 대화 · 초과 시 <b>{EXTEND_COST}별</b>
            마다 <b>{EXTEND_TURNS}번</b>씩 횟수 제한 없이 연장 · 자정 초기화
          </p>
        </div>

        {error && (
          <p className="text-12 text-red-500 text-center mb-3">{error}</p>
        )}

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={loading}
            className="btn btn-primary btn-lg disabled:cursor-not-allowed"
          >
            {loading ? <ButtonDots /> : "구매하기"}
          </button>
          <OverlayCloseButton
            disabled={loading}
            className="w-full py-3 rounded-xl border border-lilac-mid/40 text-text-light font-bold text-14 hover:bg-lilac-soft/30 active:scale-[0.98] transition disabled:opacity-50"
          >
            취소
          </OverlayCloseButton>
        </div>
    </Sheet>
  );
}
