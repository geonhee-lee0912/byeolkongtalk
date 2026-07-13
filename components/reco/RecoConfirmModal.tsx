"use client";

// 인챗 추천 카드 탭 후 뜨는 확인 모달 — ContinuationModal 포털·백드롭 패턴 미러.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { RecoProduct } from "@/lib/reco-utils";
import { RECO_DISPLAY } from "@/lib/reco-utils";

interface Props {
  open: boolean;
  product: RecoProduct | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function RecoConfirmModal({
  open,
  product,
  onCancel,
  onConfirm,
}: Props) {
  // ESC 닫기 + 배경 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onCancel]);

  if (!open || !product || typeof document === "undefined") return null;

  const display = RECO_DISPLAY[product];

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-night/75 backdrop-blur-md animate-fade-in"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md bg-cream rounded-t-3xl sm:rounded-3xl border border-lilac-mid/30 shadow-[0_-4px_24px_rgba(31,23,53,0.18)] sm:shadow-[0_8px_32px_rgba(31,23,53,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-6 flex flex-col gap-3">
          <div>
            <h2 className="font-display text-[17px] font-bold text-eye-purple mb-1">
              이 대화를 마무리하고 넘어갈까?
            </h2>
            <p className="text-[13px] text-text-light leading-relaxed">
              별콩이가 지금 대화를 정리해서 닫아줘요. 남은 대화가 있다면 계속해도 좋아요.
            </p>
          </div>

          <div className="px-3 py-2.5 rounded-xl bg-cream-warm border border-gold/30 text-[12px] text-text-light text-center">
            → {display.label}로 이어서 봐요
          </div>

          <button
            type="button"
            onClick={onConfirm}
            className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition"
          >
            마무리하고 넘어가기
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-3 rounded-xl border border-lilac-mid/40 text-text-light font-bold text-[14px] hover:bg-lilac-soft/30 active:scale-[0.98] transition"
          >
            아니, 대화 더 할래
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
