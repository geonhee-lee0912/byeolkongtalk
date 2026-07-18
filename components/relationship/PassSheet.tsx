"use client";

// S3(활성 패스 있음)에서도 패스를 연장/추가구매할 수 있게 하는 바텀시트.
// 실제 플랜 목록/구매 확인은 PassPanel + PassConfirmModal 을 그대로 재사용.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import PassPanel from "@/components/relationship/PassPanel";

interface PassSheetProps {
  relationshipId: string;
  onClose: () => void;
  onPurchased: () => void;
}

export default function PassSheet({
  relationshipId,
  onClose,
  onPurchased,
}: PassSheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-night/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="패스 연장·구매"
    >
      <div
        className="w-full max-w-md mx-auto bg-cream rounded-t-3xl border border-lilac-mid/30 shadow-[0_-4px_24px_rgba(31,23,53,0.18)] max-h-[85vh] overflow-y-auto pb-[max(env(safe-area-inset-bottom),16px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-lilac-mid/40 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          <h2 className="font-display text-[16px] font-bold text-eye-purple">
            패스 연장·구매
          </h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-light/70 hover:bg-lilac-soft/50"
          >
            ✕
          </button>
        </div>
        <div className="px-5">
          <PassPanel relationshipId={relationshipId} onPurchased={onPurchased} />
        </div>
      </div>
    </div>,
    document.body
  );
}
