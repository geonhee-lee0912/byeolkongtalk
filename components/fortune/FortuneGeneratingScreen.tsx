"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import RedHorseIcon from "@/components/fortune/RedHorseIcon";
import { FORTUNE_CONFIG, type FortuneType } from "@/lib/fortune/types";

const SAJU_STEPS = [
  "사주판을 펼치는 중…",
  "오행의 흐름을 살피는 중…",
  "별콩이가 한 장으로 정리하는 중…",
  "마지막으로 다듬는 중…",
];

const TAROT_STEPS = [
  "카드를 펼치는 중…",
  "카드의 메시지를 읽는 중…",
  "별콩이가 한 장으로 정리하는 중…",
  "마지막으로 다듬는 중…",
];

export interface FortuneGeneratingScreenProps {
  label: string;
  emoji?: string;
  type?: FortuneType;
}

// 리포트 생성중 안내 — create 요청이 진행되는 동안 표시.
// 실제 진행도는 알 수 없어 92%까지 점점 차오르는 의사 진행바.
export default function FortuneGeneratingScreen({
  label,
  emoji,
  type,
}: FortuneGeneratingScreenProps) {
  const [progress, setProgress] = useState(8);
  const [step, setStep] = useState(0);

  const steps =
    type && FORTUNE_CONFIG[type].base === "tarot" ? TAROT_STEPS : SAJU_STEPS;

  useEffect(() => {
    const p = setInterval(() => {
      setProgress((v) => (v >= 92 ? 92 : v + Math.max(1, Math.round((92 - v) / 12))));
    }, 600);
    const s = setInterval(() => {
      setStep((v) => (v + 1) % steps.length);
    }, 2200);
    return () => {
      clearInterval(p);
      clearInterval(s);
    };
  }, []);

  return (
    <main className="flex flex-1 flex-col items-center justify-center w-full px-5 animate-fade-in">
      <div className="w-full max-w-md mx-auto flex flex-col items-center">
        <div className="relative w-28 h-28 mb-6">
          <div className="absolute inset-0 bg-gold/25 rounded-full blur-2xl scale-110 animate-pulse-soft" />
          <Image
            src="/byeolkong-focus.png"
            alt="별콩이"
            width={112}
            height={112}
            priority
            className="relative animate-float"
          />
        </div>

        <h1 className="font-display text-[22px] font-bold text-eye-purple text-center flex items-center justify-center gap-1.5">
          {type === "saju_full" ? (
            <RedHorseIcon size={26} className="inline-block" />
          ) : emoji ? (
            <span>{emoji}</span>
          ) : null}
          {label}
        </h1>
        <p className="mt-2 text-[13px] text-text-light text-center leading-relaxed">
          별콩이가 너의 운세를 펼치고 있어.
          <br />
          조금만 기다려줘 ✨
        </p>

        {/* 로딩바 */}
        <div className="w-full mt-7">
          <div className="h-2.5 rounded-full bg-lilac-soft/60 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-lilac-mid via-lilac-deep to-eye-purple transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-3 text-[12px] text-text-light/80 text-center transition-opacity">
            {steps[step]}
          </p>
        </div>
      </div>
    </main>
  );
}
