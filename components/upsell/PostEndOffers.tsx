"use client";

import { useEffect } from "react";
import { CLARIFIER_COST, EXTEND_COST, EXTEND_TURNS } from "@/lib/upsell";

type Product = "extend" | "clarifier";

interface Props {
  extend: boolean;
  clarifier: boolean;
  /** 구매 요청이 서버에 가 있는 동안 — 두 버튼을 잠그고 '처리 중…' 으로 바꾼다(인챗 칩과 같은 표시) */
  busy?: boolean;
  onExtend: () => void;
  onClarifier: () => void;
  /** 노출 계측 — 부모가 리딩·상품·지면 단위로 dedup */
  onShown?: (product: Product) => void;
}

// break-keep: 좁은 폭(320px)에서 한글이 단어 중간에서 꺾이지 않게 · px-2: 글자가 테두리에 닿지 않게
const BUTTON_CLASS =
  "flex-1 px-2 py-2.5 rounded-xl border border-gold/60 bg-cream-warm text-[12.5px] font-bold text-eye-purple break-keep disabled:opacity-50 disabled:cursor-not-allowed";

/**
 * 강제 종료선에서 닫힌 대화의 재개 제안 — '결과 보기 →' 아래 보조 버튼 (spec 2026-10-04 §3-4).
 * 별콩이 대사는 늘리지 않는다. 노출 조건(강제 종료·비위기·한도)은 서버가 판정해 넘긴다.
 */
export default function PostEndOffers({ extend, clarifier, busy, onExtend, onClarifier, onShown }: Props) {
  useEffect(() => {
    if (extend) onShown?.("extend");
    if (clarifier) onShown?.("clarifier");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extend, clarifier]);

  if (!extend && !clarifier) return null;

  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <p className="text-[11px] text-text-light text-center">아직 할 얘기가 남았다면</p>
      <div className="flex gap-2">
        {extend && (
          <button type="button" onClick={onExtend} disabled={busy} className={BUTTON_CLASS}>
            {busy ? (
              "처리 중…"
            ) : (
              <>
                {EXTEND_TURNS}턴 더 이어가기 <span className="font-normal text-eye-purple">⭐{EXTEND_COST}</span>
              </>
            )}
          </button>
        )}
        {clarifier && (
          <button type="button" onClick={onClarifier} disabled={busy} className={BUTTON_CLASS}>
            {busy ? (
              "처리 중…"
            ) : (
              <>
                카드 한 장 더 뽑고 이어가기 <span className="font-normal text-eye-purple">⭐{CLARIFIER_COST}</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
