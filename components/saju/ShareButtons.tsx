"use client";

import { useState } from "react";

export interface ShareButtonsProps {
  readingId: string;
  question: string;
  dayStem: string;
  dayElement: string;
  closingLine: string | null;
  hasSensitive: boolean;
}

function buildShareText(args: {
  question: string;
  dayStem: string;
  dayElement: string;
  closingLine: string | null;
  url: string;
}) {
  const { question, dayStem, dayElement, closingLine, url } = args;
  const parts = [
    "[별콩이의 사주 풀이]",
    `💭 ${question}`,
    `🌟 일간 ${dayStem} (${dayElement})`,
  ];
  if (closingLine) parts.push(`✨ ${closingLine}`);
  parts.push(`🌙 ${url}`);
  return parts.join("\n\n");
}

export default function ShareButtons({
  readingId,
  question,
  dayStem,
  dayElement,
  closingLine,
  hasSensitive,
}: ShareButtonsProps) {
  const [toast, setToast] = useState<string | null>(null);

  if (hasSensitive) {
    return (
      <div className="bg-cream-warm rounded-2xl p-4 border border-lilac-mid/30">
        <p className="text-[13px] text-eye-purple text-center leading-relaxed">
          🤍 이 대화는 너만의 기록으로 둘게.
          <br />
          공유 없이 마이페이지에서 다시 볼 수 있어.
        </p>
      </div>
    );
  }

  const handleShare = async () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/saju/result?id=${readingId}`
        : "";
    const text = buildShareText({
      question,
      dayStem,
      dayElement,
      closingLine,
      url,
    });

    // Web Share API 우선
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "별콩이의 사주 풀이",
          text,
          url,
        });
        return;
      } catch {
        // 사용자 취소 또는 미지원 — 폴백
      }
    }

    // 클립보드 폴백
    try {
      await navigator.clipboard.writeText(text);
      setToast("대화 내용을 복사했어");
      setTimeout(() => setToast(null), 2200);
    } catch {
      setToast("공유에 실패했어");
      setTimeout(() => setToast(null), 2200);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleShare}
        className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[14px] hover:bg-lilac-deep/90 active:scale-[0.98] transition"
      >
        친구에게 이 풀이 공유하기
      </button>
      {toast && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-10 px-3 py-2 rounded-lg bg-night text-white text-[12px] whitespace-nowrap shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
