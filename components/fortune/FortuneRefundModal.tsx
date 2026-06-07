"use client";

// 생성 오류로 별이 차감됐다 환불된 상황 안내 — 확인 버튼을 누를 때까지 유지(배경 클릭으로 안 닫힘).

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface FortuneRefundModalProps {
  cost: number;
  label: string;
  onClose: () => void;
}

export default function FortuneRefundModal({ cost, label, onClose }: FortuneRefundModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-night/50 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md mx-auto bg-cream rounded-t-3xl sm:rounded-3xl p-6 pb-[max(env(safe-area-inset-bottom),24px)] sm:pb-6">
        <div className="flex flex-col items-center text-center mb-5">
          <div className="relative w-12 h-12 mb-2">
            <div className="absolute inset-0 bg-gold/30 rounded-full blur-lg scale-110" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/profile.png" alt="별콩이" className="relative w-full h-full object-contain" />
          </div>
          <p className="font-display text-[17px] text-eye-purple leading-tight">
            앗, {label} 리포트를 만들다 문제가 생겼어
          </p>
          <p className="text-[12.5px] text-text-light/85 mt-2 leading-relaxed">
            사용한 별 <span className="font-bold text-eye-purple">{cost}개</span>는 다시 돌려놨어.
            <br />
            잠시 후 다시 시도해줄래?
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-full text-white font-bold text-[14px] active:scale-[0.98] transition-all"
          style={{ background: "#9F8AD0", boxShadow: "0 6px 18px #9F8AD055" }}
        >
          확인
        </button>
      </div>
    </div>,
    document.body
  );
}
