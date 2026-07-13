"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import CardDrawRitual from "@/components/tarot/CardDrawRitual";
import { CLARIFIER_COST } from "@/lib/upsell";
import type { DrawnCard } from "@/lib/tarot/spreads";

interface Props {
  open: boolean;
  readingId: string;
  /** 이미 뽑힌 카드들 — 덱에서 제외 + POST 후 반환값으로 교체 */
  drawnCards: DrawnCard[];
  accent: string;
  onClose: () => void;
  /** clarifier API 성공 후 호출 — 갱신된 drawnCards 전달 */
  onDrawn: (newDrawnCards: DrawnCard[]) => void;
  /** 잔액 부족(402) 시 호출 — TODO: Task 7 RechargeSheet 연결 */
  onInsufficient?: (balance: number) => void;
}

/**
 * 보조 카드 드로우 바텀시트.
 * CardDrawRitual slim 모드(cardCount=1)로 한 장 선택 → clarifier API 호출.
 * shallow history로 OS 뒤로가기 = 시트 닫기.
 */
export default function ClarifierSheet({
  open,
  readingId,
  drawnCards,
  accent,
  onClose,
  onDrawn,
  onInsufficient,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  // 열릴 때 잔액 로드 + shallow history push
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);

    // 잔액 fetch (비동기, 실패해도 무시)
    fetch("/api/stars/balance", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setBalance(d.balance ?? 0); })
      .catch(() => {});

    // shallow history — OS 백버튼으로 닫기
    history.pushState({ sheet: "clarifier" }, "");
    const handlePop = () => { onClose(); };
    window.addEventListener("popstate", handlePop);
    return () => {
      window.removeEventListener("popstate", handlePop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ESC + 배경 스크롤 잠금
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeSheet(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function closeSheet() {
    // history 스택이 아직 우리 항목이면 정리
    if (history.state?.sheet === "clarifier") {
      history.back();
    } else {
      onClose();
    }
  }

  async function handleDrawComplete(drawn: DrawnCard[]) {
    if (drawn.length === 0 || submitting) return;
    const card = drawn[0];
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/consultations/tarot/clarifier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          readingId,
          card: { card_id: card.card_id, direction: card.direction },
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 402) {
        const bal = (data as { balance?: number }).balance ?? 0;
        if (onInsufficient) onInsufficient(bal);
        else setError(`별이 부족해. 현재 잔액: ⭐${bal}`);
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        const msg =
          (data as { error?: string }).error === "clarifier_limit_reached"
            ? "이미 최대 횟수만큼 보조 카드를 뽑았어"
            : (data as { error?: string }).error === "card_already_drawn"
            ? "이미 나온 카드야. 다른 카드를 골라줘"
            : "카드를 추가하지 못했어. 잠시 후 다시 시도해줄래?";
        setError(msg);
        setSubmitting(false);
        return;
      }

      const updated = (data as { drawnCards?: DrawnCard[] }).drawnCards ?? [];
      onDrawn(updated);
      onClose();
    } catch {
      setError("연결이 흔들렸어. 잠시 후 다시 시도해줄래?");
      setSubmitting(false);
    }
  }

  if (!open || typeof document === "undefined") return null;

  const excludeIds = drawnCards.map((c) => c.card_id);

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-night/70 backdrop-blur-sm animate-fade-in"
      onClick={closeSheet}
      role="dialog"
      aria-modal="true"
      aria-label="보조 카드 뽑기"
    >
      <div
        className="w-full max-w-md bg-cream rounded-t-3xl border border-lilac-mid/30 shadow-[0_-4px_24px_rgba(31,23,53,0.18)] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 그랩바 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-lilac-mid/40 rounded-full" />
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3">
          <h2 className="font-display text-[17px] font-bold text-eye-purple">
            카드 한 장 더 뽑기
          </h2>
          <button
            onClick={closeSheet}
            aria-label="닫기"
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-light/70 hover:bg-lilac-soft/50"
          >
            ✕
          </button>
        </div>

        {/* 안내 */}
        <div className="mx-5 mb-4 px-4 py-3 rounded-xl bg-cream-warm border border-lilac-mid/20">
          <p className="text-[13px] text-eye-purple leading-relaxed">
            마음 가는 카드 한 장만 더 골라줘
          </p>
          <p className="text-[11px] text-text-light mt-1 leading-snug">
            뽑는 순간 ⭐{CLARIFIER_COST}
            {balance !== null ? ` · 현재 잔액 ⭐${balance}` : ""}
             · 지금 카드들과 이어서 봐줄게
          </p>
        </div>

        {error && (
          <p className="text-[12px] text-red-500 text-center px-5 mb-3">
            {error}
          </p>
        )}

        {submitting ? (
          <div className="py-10 text-center text-text-light text-sm">
            처리 중…
          </div>
        ) : (
          <CardDrawRitual
            slim
            cardCount={1}
            slotLabels={["+1"]}
            accent={accent}
            ritualLabel="보조 카드"
            completeLabel={`카드 선택 · ⭐${CLARIFIER_COST}`}
            excludeCardIds={excludeIds}
            onComplete={handleDrawComplete}
          />
        )}
      </div>
    </div>,
    document.body
  );
}
