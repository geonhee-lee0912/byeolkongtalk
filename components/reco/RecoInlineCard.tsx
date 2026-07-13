"use client";

// 인챗 인라인 추천 카드 — assistant 말풍선 아래 붙는 소형 카드.
// `continue` product는 이 컴포넌트를 사용하지 않음 (호출측에서 필터).
import type { RecoProduct } from "@/lib/reco-utils";
import { RECO_DISPLAY } from "@/lib/reco-utils";

interface Props {
  product: RecoProduct;
  onTap: () => void;
}

export default function RecoInlineCard({ product, onTap }: Props) {
  const display = RECO_DISPLAY[product];

  return (
    <div className="mt-2 mb-1 max-w-xs ml-10">
      <button
        type="button"
        onClick={onTap}
        className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border border-gold/50 bg-cream-warm hover:border-gold/80 hover:bg-gold/5 active:scale-[0.98] transition text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-bold text-eye-purple truncate">
            {display.label}
          </div>
          <div className="text-[11px] text-text-light mt-0.5 leading-snug">
            지난 고민을 기억한 채 이어져요
          </div>
        </div>
        <span className="text-text-light/60 text-[14px] shrink-0">›</span>
      </button>
    </div>
  );
}
