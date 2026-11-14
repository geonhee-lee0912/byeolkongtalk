"use client";

import { useState, type ReactNode } from "react";
import { shareToKakao, isKakaoReady } from "@/lib/kakao-share";
import Sheet from "@/components/common/Sheet";
import { useOverlayClose } from "@/components/common/overlay-close";

// 결과 화면 공유 — '공유하기' 버튼 하나, 누르면 시트에서 카톡·링크·이미지 중 고른다(디자인 다듬기 /tarot/result ⑥ B, 운영자 11-14).
// 예전엔 노란 카톡 큰 버튼 + 연보라 버튼 둘이 늘 펼쳐져 화면에서 제일 큰 색 덩어리였다.
// 아이콘 셋은 면 아이콘 30종(components/common/Icon)에 없는 것이라 여기 선 그림으로 둔다 — 카톡 말풍선은 원래 있던 그림.
const line = (d: ReactNode, size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
const SHARE_ICON = line(<><path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></>, 18);
const LINK_ICON = line(<><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></>, 24);
const SAVE_ICON = line(<><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></>, 24);
const KAKAO_ICON = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.8 5.3 4.6 6.8L5.4 22l4.6-2.5c.7.1 1.4.1 2 .1 5.5 0 10-3.6 10-8S17.5 3 12 3z" />
  </svg>
);

/** 시트 안 공유 칸 하나 — 누르면 시트를 닫고 그 공유를 한다 */
function ShareOption({
  icon,
  label,
  circleClass,
  disabled,
  onPick,
}: {
  icon: ReactNode;
  label: string;
  circleClass: string;
  disabled?: boolean;
  onPick: () => void;
}) {
  const close = useOverlayClose();
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        onPick(); // 기기 공유창(navigator.share)은 누른 그 순간에 불러야 열린다 — 닫기보다 먼저
        close();
      }}
      className="flex flex-col items-center gap-2 disabled:opacity-50"
    >
      <span className={`w-14 h-14 rounded-full flex items-center justify-center ${circleClass}`}>{icon}</span>
      <span className="text-13 font-semibold text-eye-purple">{label}</span>
    </button>
  );
}

export interface TarotShareButtonsProps {
  readingId: string;
  question: string;
  spreadLabel: string;
  /** 뽑은 카드 목록 (포지션: 카드명 줄단위) */
  cardsText: string;
  closingLine: string | null;
  hasSensitive: boolean;
}

function buildShareText(args: {
  question: string;
  spreadLabel: string;
  cardsText: string;
  closingLine: string | null;
  url: string;
}) {
  const { question, spreadLabel, cardsText, closingLine, url } = args;
  const parts = [
    "[별콩이의 타로 풀이]",
    `💭 ${question}`,
    `🃏 ${spreadLabel}`,
  ];
  if (cardsText) parts.push(cardsText);
  if (closingLine) parts.push(`✨ ${closingLine}`);
  parts.push(`🌙 ${url}`);
  return parts.join("\n\n");
}

export default function TarotShareButtons({
  readingId,
  question,
  spreadLabel,
  cardsText,
  closingLine,
  hasSensitive,
}: TarotShareButtonsProps) {
  const [toast, setToast] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (hasSensitive) {
    return (
      <div className="card">
        <p className="text-13 text-eye-purple text-center leading-relaxed">
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
    const text = buildShareText({
      question,
      spreadLabel,
      cardsText,
      closingLine,
      url,
    });

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
      buttonTitle: "나도 타로 보기",
    });
    if (!ok) {
      setToast("카카오 SDK 가 아직 준비 안 됐어");
      setTimeout(() => setToast(null), 2200);
    }
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary btn-lg gap-2">
        {SHARE_ICON}
        공유하기
      </button>
      {open && (
        <Sheet label="공유하기" onClose={() => setOpen(false)} z={80}>
          <p className="text-17 font-black tracking-tight text-center mb-[22px]">어디로 공유할까?</p>
          <div className="grid grid-cols-3">
            <ShareOption
              icon={KAKAO_ICON}
              label="카카오톡"
              circleClass="bg-[#FEE500] text-[#3C1E1E]"
              disabled={!isKakaoReady()}
              onPick={handleKakaoShare}
            />
            <ShareOption icon={LINK_ICON} label="링크로 공유" circleClass="bg-lilac-soft text-eye-purple" onPick={handleShare} />
            <ShareOption icon={SAVE_ICON} label="이미지 저장" circleClass="bg-lilac-soft text-eye-purple" onPick={handleInstaSave} />
          </div>
        </Sheet>
      )}
      {toast && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-10 px-3 py-2 rounded-lg bg-night text-white text-12 whitespace-nowrap shadow-float">
          {toast}
        </div>
      )}
    </div>
  );
}
