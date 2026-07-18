"use client";

// 패스 구매 확인 팝업 — PassPanel 에서 플랜 탭 시 즉시구매 대신 이 확인 단계를 거친다.
// 포털/백드롭 패턴은 ContinuationModal·RecoConfirmModal 과 동일.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  DAILY_TURN_CAP,
  EXTEND_COST,
  EXTEND_TURNS,
  type PassPlan,
} from "@/lib/relationship/types";

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

  // 배경 스크롤 잠금 — 마운트 동안 유지
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // ESC 닫기 (구매 진행 중엔 닫기 불가) — loading 최신값을 반영해야 하므로 deps에 포함
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loading, onClose]);

  if (typeof document === "undefined") return null;

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

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-night/75 backdrop-blur-md animate-fade-in"
      onClick={() => !loading && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md mx-auto bg-cream rounded-t-3xl sm:rounded-3xl border border-lilac-mid/30 shadow-[0_-4px_24px_rgba(31,23,53,0.18)] sm:shadow-[0_8px_32px_rgba(31,23,53,0.25)] p-6 pb-[max(env(safe-area-inset-bottom),24px)] sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-5">
          <p className="font-display text-[17px] font-bold text-eye-purple">
            {plan.label} 구매할까?
          </p>
          <p className="mt-1.5 text-[16px] font-bold text-lilac-deep">
            ⭐ {plan.cost}별 차감
          </p>
        </div>

        <div className="rounded-xl border border-gold/50 bg-gold-soft/20 p-3 mb-5">
          <p className="text-[11.5px] text-eye-purple leading-relaxed">
            하루 <b>{DAILY_TURN_CAP}번</b> 대화 · 초과 시 <b>{EXTEND_COST}별</b>
            마다 <b>{EXTEND_TURNS}번</b>씩 횟수 제한 없이 연장 · 자정 초기화
          </p>
        </div>

        {error && (
          <p className="text-[12px] text-red-500 text-center mb-3">{error}</p>
        )}

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "구매하는 중…" : "구매하기"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="w-full py-3 rounded-xl border border-lilac-mid/40 text-text-light font-bold text-[14px] hover:bg-lilac-soft/30 active:scale-[0.98] transition disabled:opacity-50"
          >
            취소
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
