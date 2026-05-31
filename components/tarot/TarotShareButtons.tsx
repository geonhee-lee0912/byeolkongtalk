"use client";

import { useState } from "react";
import { shareToKakao, isKakaoReady } from "@/lib/kakao-share";

export interface TarotShareButtonsProps {
  readingId: string;
  question: string;
  spreadLabel: string;
  closingLine: string | null;
  hasSensitive: boolean;
}

function buildShareText(args: {
  question: string;
  spreadLabel: string;
  closingLine: string | null;
  url: string;
}) {
  const { question, spreadLabel, closingLine, url } = args;
  const parts = [
    "[별콩이의 타로 풀이]",
    `💭 ${question}`,
    `🃏 ${spreadLabel}`,
  ];
  if (closingLine) parts.push(`✨ ${closingLine}`);
  parts.push(`🌙 ${url}`);
  return parts.join("\n\n");
}

export default function TarotShareButtons({
  readingId,
  question,
  spreadLabel,
  closingLine,
  hasSensitive,
}: TarotShareButtonsProps) {
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
        ? `${window.location.origin}/tarot/result?id=${readingId}`
        : "";
    const text = buildShareText({ question, spreadLabel, closingLine, url });

    // 모바일에서만 네이티브 공유 시트. 데스크톱은 텍스트 복사로.
    const isMobile =
      typeof navigator !== "undefined" &&
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

    if (isMobile && navigator.share) {
      try {
        await navigator.share({ title: "별콩이의 타로 풀이", text, url });
        return;
      } catch {
        // 사용자 취소 또는 미지원 — 폴백
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setToast("대화 내용을 복사했어");
      setTimeout(() => setToast(null), 2200);
    } catch {
      setToast("공유에 실패했어");
      setTimeout(() => setToast(null), 2200);
    }
  };

  const handleInstaSave = async () => {
    if (typeof window === "undefined") return;
    try {
      const res = await fetch(`/api/og/tarot/${readingId}?format=instagram`);
      if (!res.ok) throw new Error("og_failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `byeolkong-tarot-${readingId.slice(0, 8)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setToast("이미지를 저장했어! 스토리에 올려봐 ✨");
      setTimeout(() => setToast(null), 2600);
    } catch {
      setToast("이미지 저장에 실패했어");
      setTimeout(() => setToast(null), 2200);
    }
  };

  const handleKakaoShare = () => {
    if (typeof window === "undefined") return;
    const link = `${window.location.origin}/tarot/result?id=${readingId}`;
    const imageUrl = `${window.location.origin}/api/og/tarot/${readingId}`;
    const ok = shareToKakao({
      title: "별콩이의 타로 풀이",
      description: closingLine ?? spreadLabel,
      imageUrl,
      link,
    });
    if (!ok) {
      setToast("카카오 SDK 가 아직 준비 안 됐어");
      setTimeout(() => setToast(null), 2200);
    }
  };

  return (
    <div className="relative flex flex-col gap-2">
      <button
        onClick={handleKakaoShare}
        disabled={!isKakaoReady()}
        className="w-full py-3.5 rounded-xl bg-[#FEE500] text-[#3C1E1E] font-bold text-[14px] flex items-center justify-center gap-2 hover:brightness-95 active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.8 5.3 4.6 6.8L5.4 22l4.6-2.5c.7.1 1.4.1 2 .1 5.5 0 10-3.6 10-8S17.5 3 12 3z" />
        </svg>
        카카오톡으로 공유하기
      </button>
      <button
        onClick={handleShare}
        className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[13px] hover:bg-lilac-deep/90 active:scale-[0.98] transition"
      >
        링크로 공유하기
      </button>
      <button
        onClick={handleInstaSave}
        className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[13px] hover:bg-lilac-deep/90 active:scale-[0.98] transition"
      >
        이미지로 저장
      </button>
      {toast && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-10 px-3 py-2 rounded-lg bg-night text-white text-[12px] whitespace-nowrap shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
