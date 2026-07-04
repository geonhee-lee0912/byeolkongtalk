"use client";

// 웰컴 별 도착 팝업 — 광고 랜딩(/start) 신규 가입 복귀 시 1회 노출.
// body 포털 (페이지 transform 스택 컨텍스트에서 z-40/50 쉘 아래 깔리는 문제 회피).

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { WELCOME_BONUS_STARS } from "@/lib/constants";

export default function WelcomeStarsModal({
  onStart,
}: {
  onStart: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-night/60 backdrop-blur-sm animate-fade-in px-5">
      <div className="w-full max-w-sm bg-cream rounded-3xl p-7 text-center">
        <div className="relative w-24 h-24 mx-auto mb-3">
          <div className="absolute inset-0 bg-gold/40 rounded-full blur-xl scale-110" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/byeolkong-main.png"
            alt="별콩이"
            className="relative w-full h-full object-contain"
          />
        </div>
        <p className="font-display text-[22px] text-eye-purple leading-tight">
          웰컴 별 {WELCOME_BONUS_STARS}개 도착 ✨
        </p>
        <p className="mt-2 text-[13px] text-text-light leading-relaxed">
          만나서 반가워! 별콩이가 선물을 준비했어.
          <br />이 별로 상담이나 운세를 바로 볼 수 있어.
        </p>
        <div className="mt-4 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gold-soft/40">
          <span className="text-[13px] font-extrabold text-eye-purple">
            현재 잔액 ⭐ {WELCOME_BONUS_STARS}
          </span>
        </div>
        <button
          onClick={onStart}
          className="mt-6 w-full py-3.5 rounded-full bg-lilac-deep text-white font-bold text-[15px] active:scale-[0.98] transition"
        >
          바로 시작하기
        </button>
      </div>
    </div>,
    document.body
  );
}
