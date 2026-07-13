"use client";

import { CLARIFIER_COST } from "@/lib/upsell";

export type ClarifierChipState = "idle" | "done";

interface Props {
  state: ClarifierChipState;
  onTap: () => void;
}

/**
 * 인챗 업셀 — 보조 카드 한 장 더 뽑기 칩.
 * RECO:tarot:clarifier 마커가 붙은 메시지 바로 아래에 렌더.
 */
export default function ClarifierChip({ state, onTap }: Props) {
  const done = state === "done";

  return (
    <div className="mt-2 mb-1 max-w-xs ml-10">
      <button
        type="button"
        onClick={done ? undefined : onTap}
        disabled={done}
        className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border transition text-left ${
          done
            ? "border-lilac-mid/30 bg-lilac-soft/40 cursor-default"
            : "border-gold/50 bg-cream-warm hover:border-gold/80 hover:bg-gold/5 active:scale-[0.98]"
        }`}
      >
        <span className="text-[15px] shrink-0">🃏</span>
        <div className="flex-1 min-w-0">
          {done ? (
            <div className="text-[12px] font-bold text-text-light truncate">
              ✓ 카드를 이어서 봤어
            </div>
          ) : (
            <>
              <div className="text-[12px] font-bold text-eye-purple truncate">
                카드 한 장 더 뽑기
              </div>
              <div className="text-[11px] text-text-light mt-0.5">
                ⭐{CLARIFIER_COST} · 지금 대화에서 바로
              </div>
            </>
          )}
        </div>
        {!done && (
          <span className="text-text-light/60 text-[14px] shrink-0">›</span>
        )}
      </button>
    </div>
  );
}
