"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { MenuProduct } from "@/lib/tarot/menu";
import { compareFacts, koCardCount, priceLine, type CompareFacts } from "@/lib/tarot/menu-price";
import type { Wallet } from "@/lib/wallet";

/**
 * 유료 상품 비교 창 — 맛보기와 나란히: 보는 질문 수·카드 자리·첫 풀이 분량·대화 길이 (스펙 §5-2, 시안 menu-mock-v1 ③).
 * 3장(₩1,000)과 깊게(₩4,900)의 차이가 "질문 3개 vs 5개"로 보여야 깊게 갈 사람이 3장으로 내려오지 않는다.
 * '이걸로 볼래'가 가격 동의를 겸한다. 뒤로가기·ESC·배경 탭으로 닫힌다(RechargeSheet 와 같은 관행).
 * 🔴 열 때 history 를 한 칸 쌓는다 — 여기서 다른 화면으로 갈 땐 호출부가 router.replace 로 그 칸을 바꿔 쓴다.
 */
export default function CompareSheet({
  product,
  teaser,
  wallet,
  onConfirm,
  onTeaser,
  onClose,
}: {
  product: MenuProduct;
  teaser: MenuProduct;
  wallet: Wallet;
  onConfirm: () => void;
  onTeaser: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    history.pushState({ sheet: "compare" }, "");
    const onPop = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    if (history.state?.sheet === "compare") history.back();
    else onClose();
  }

  const a = compareFacts(teaser);
  const b = compareFacts(product);
  const line = priceLine(product, wallet);
  const count = koCardCount(b.cards);

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-night/60 backdrop-blur-sm animate-fade-in"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={`${product.name} — 맛보기와 비교`}
    >
      <div
        className="w-full max-w-md max-h-[88vh] overflow-y-auto rounded-t-3xl bg-cream px-5 pt-3 pb-[max(env(safe-area-inset-bottom),20px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pb-2">
          <div className="h-1 w-10 rounded-full bg-lilac-mid/40" />
        </div>
        <p className="text-center font-display text-[17px] leading-snug text-eye-purple">{product.name}</p>
        <p className="mt-1 text-center text-[11.5px] text-eye-purple/75">
          한 장으로는 답 하나까지만 보여. {count}이면 이만큼 달라져
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <FactColumn title="한 장 (맛보기)" facts={a} highlight={false} />
          <FactColumn title={`${count} (이 상품)`} facts={b} highlight />
        </div>
        <p className="mt-3 text-center text-[12.5px] font-black tabular-nums text-eye-purple">
          {line.main}
          {line.sub ? ` · ${line.sub}` : ""}
        </p>
        <button
          type="button"
          onClick={onConfirm}
          className="mt-3 w-full rounded-full bg-lilac-deep py-3.5 text-[14px] font-bold text-white transition active:scale-[0.98]"
        >
          이걸로 볼래 →
        </button>
        <button
          type="button"
          onClick={onTeaser}
          className="mt-1.5 w-full py-2 text-[12px] text-eye-purple/70 underline underline-offset-2"
        >
          맛보기부터 해볼래
        </button>
      </div>
    </div>,
    document.body
  );
}

function FactColumn({ title, facts, highlight }: { title: string; facts: CompareFacts; highlight: boolean }) {
  return (
    <div
      className={`rounded-xl px-3 py-2.5 text-[11.5px] leading-relaxed text-eye-purple ${
        highlight ? "border-2 border-gold bg-cream-warm" : "border border-lilac-mid/40 bg-white"
      }`}
    >
      <p className="mb-1 text-[12px] font-black">{title}</p>
      <p>
        보는 질문 <b>{facts.cards}개</b>
      </p>
      <ul className="mt-0.5">
        {facts.positions.map((label) => (
          <li key={label}>· {label}</li>
        ))}
      </ul>
      <p className="mt-1.5">풀이 {facts.chars}</p>
      <p>대화 {facts.turns}턴</p>
    </div>
  );
}
