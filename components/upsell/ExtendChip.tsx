"use client";

import { useEffect } from "react";
import { EXTEND_COST, EXTEND_TURNS } from "@/lib/upsell";

export type ExtendChipState = "idle" | "loading" | "done";

interface Props {
  state: ExtendChipState;
  onTap: () => void;
  /** 노출 계측 — 마운트 1회 */
  onShown?: () => void;
  /** 잠금 — 답이 출력되는 동안·다른 구매 중엔 못 누른다(문구는 그대로 두고 흐리게만) */
  disabled?: boolean;
}

/**
 * 인챗 업셀 — 대화 연장 칩.
 * RECO:extend 마커가 붙은 메시지 바로 아래에 렌더.
 */
export default function ExtendChip({ state, onTap, onShown, disabled }: Props) {
  const done = state === "done";
  const loading = state === "loading";

  // 노출 계측 — 마운트 1회, 아직 안 산(idle) 칩만. 리딩·상품·지면 단위 dedup 은 부모가 한다
  useEffect(() => {
    if (state === "idle") onShown?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-2 mb-1 max-w-xs ml-10">
      <button
        type="button"
        onClick={done || loading || disabled ? undefined : onTap}
        disabled={done || loading || disabled}
        className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border transition text-left ${
          done
            ? "border-lilac-mid/30 bg-lilac-soft/40 cursor-default"
            : loading
            ? "border-gold/30 bg-cream-warm opacity-70 cursor-wait"
            : disabled
            ? "border-gold/30 bg-cream-warm opacity-60 cursor-not-allowed"
            : "border-gold/50 bg-cream-warm hover:border-gold/80 hover:bg-gold/5 active:scale-[0.98]"
        }`}
      >
        <span className="text-[15px] shrink-0">💬</span>
        <div className="flex-1 min-w-0">
          {done ? (
            <div className="text-[12px] font-bold text-text-light truncate">
              ✓ 이어가는 중
            </div>
          ) : loading ? (
            <div className="text-[12px] font-bold text-eye-purple truncate">
              처리 중…
            </div>
          ) : (
            <>
              <div className="text-[12px] font-bold text-eye-purple truncate">
                별콩이랑 더 얘기하기
              </div>
              <div className="text-[11px] text-text-light mt-0.5">
                ⭐{EXTEND_COST} · +{EXTEND_TURNS}턴
              </div>
            </>
          )}
        </div>
        {!done && !loading && (
          <span className="text-text-light/60 text-[14px] shrink-0">›</span>
        )}
      </button>
    </div>
  );
}
