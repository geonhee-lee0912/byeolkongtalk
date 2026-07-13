"use client";

// 결과 화면 "다음 상담 추천" 카드 — next_reco(마커 1순위 or haiku 2순위) 기반.
// hasSensitive=true 또는 reco 없으면 null 반환.
import { useRouter } from "next/navigation";
import type { NextReco } from "@/lib/reco-utils";
import { RECO_DISPLAY } from "@/lib/reco-utils";
import { PENDING_KEY } from "@/lib/emotions";

interface Props {
  reco: NextReco;
  readingId: string;
  question: string;
  emotionTag: string | null;
  hasSensitive: boolean;
  onContinue: () => void;
}

export default function RecoCard({
  reco,
  readingId,
  question,
  emotionTag,
  hasSensitive,
  onContinue,
}: Props) {
  const router = useRouter();

  if (hasSensitive) return null;

  const display = RECO_DISPLAY[reco.product];
  const hook = reco.hook ?? display.defaultHook;

  const handleClick = () => {
    if (reco.product === "continue") {
      onContinue();
      return;
    }

    // cross-type: sessionStorage 2키 세팅 후 라우팅
    sessionStorage.setItem(
      "byeolkong:continuation",
      JSON.stringify({ previousReadingId: readingId, mode: "fresh" })
    );
    const pending: Record<string, unknown> = {
      emotion: emotionTag ?? "",
      concern: question,
      type: display.target,
    };
    if (display.sajuProduct) {
      pending.sajuProduct = display.sajuProduct;
    }
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));

    router.push(display.target === "saju" ? "/saju" : "/tarot");
  };

  return (
    <div className="w-full max-w-md mx-auto px-5 mt-4">
      <div className="rounded-2xl border-2 border-gold/60 bg-cream-warm p-4">
        <div className="text-[11px] font-bold text-text-light mb-1.5">
          별콩이 추천
        </div>
        {reco.question && (
          <p className="text-[12px] text-eye-purple/70 mb-1 leading-relaxed">
            &ldquo;{reco.question}&rdquo;
          </p>
        )}
        <p className="text-[13px] text-eye-purple leading-relaxed mb-3">
          {hook}
        </p>
        <button
          onClick={handleClick}
          className="w-full py-3 rounded-xl bg-gold/90 text-eye-purple font-bold text-[14px] hover:bg-gold active:scale-[0.98] transition"
        >
          {display.label}
        </button>
      </div>
    </div>
  );
}
