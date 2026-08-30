"use client";

// 이미 같은 사주로 본 상품을 다시 사려 할 때 — 보관함 유도 + 재생성(force) 선택.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function AlreadyOwnedModal({
  label,
  cost,
  onReview,
  onRegenerate,
  onClose,
}: {
  label: string;
  cost: number;
  onReview: () => void;
  onRegenerate: () => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-night/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-auto bg-cream rounded-t-3xl sm:rounded-3xl p-6 pb-[max(env(safe-area-inset-bottom),24px)] sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-5">
          <p className="font-display text-[17px] text-eye-purple leading-tight">이미 이 사주로 봤어</p>
          <p className="text-[12.5px] text-text-light/85 mt-1.5 leading-relaxed">
            같은 사주로 <b className="text-eye-purple">{label}</b>은(는) 이미 봤어.
            <br />
            보관함에서 다시 볼 수 있어. 새로 뽑으면 별 {cost}개가 다시 들어.
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          <button
            onClick={onReview}
            className="w-full py-3.5 rounded-full bg-lilac-deep text-white font-bold text-[14px] active:scale-[0.98] transition"
          >
            보관함에서 보기
          </button>
          <button
            onClick={onRegenerate}
            className="w-full py-3 rounded-full border-2 border-lilac-deep/40 text-lilac-deep font-bold text-[13px] hover:bg-lilac-deep/5 transition"
          >
            그래도 새로 뽑기 · ⭐{cost}
          </button>
          <button onClick={onClose} className="w-full py-2.5 text-[13px] text-text-light">
            닫기
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
