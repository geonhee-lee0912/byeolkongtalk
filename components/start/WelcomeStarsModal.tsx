"use client";

// 웰컴 별 도착 팝업 — 신규 가입 복귀 시 1회. /start 는 자기 페이지에서, 그 밖(앱·웹)은 AuthBootstrap 이 띄운다.
// '현재 잔액' 알약은 뺐다 — 제목과 같은 숫자를 한 번 더 말할 뿐이었다(디자인 다듬기 ② 운영자 11-12).
// body 포털 (페이지 transform 스택 컨텍스트에서 z-40/50 쉘 아래 깔리는 문제 회피).

import { useEffect, useState } from "react";
import Dialog from "@/components/common/Dialog";
import { WELCOME_BONUS_STARS } from "@/lib/constants";

export default function WelcomeStarsModal({
  onStart,
}: {
  onStart: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  // '바로 시작하기'로만 닫힌다(바깥 누르기·ESC 무시)
  return (
    <Dialog
      label={`웰컴 별 ${WELCOME_BONUS_STARS}개 도착`}
      onClose={onStart}
      dismissible={false}
      z={80}
      gutterClassName="px-5"
      backdropClassName="bg-night/50 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm bg-cream rounded-3xl p-7 text-center">
        <div className="relative w-24 h-24 mx-auto mb-3">
          <div className="absolute inset-0 bg-gold/30 rounded-full blur-lg scale-110" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/byeolkong-joy.png"
            alt="별콩이"
            className="relative w-full h-full object-contain"
          />
        </div>
        <p className="font-display text-22 text-eye-purple leading-tight">
          웰컴 별 {WELCOME_BONUS_STARS}개 도착
        </p>
        <p className="mt-2 text-13 text-text-light leading-relaxed">
          만나서 반가워! 별콩이가 선물을 준비했어.
          <br />이 별로 상담이나 운세를 바로 볼 수 있어.
        </p>
        <button
          onClick={onStart}
          className="btn btn-primary btn-lg mt-6"
        >
          바로 시작하기
        </button>
      </div>
    </Dialog>
  );
}
