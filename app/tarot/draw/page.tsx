"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SPREAD_INFO,
  getPositionLabels,
  type SpreadType,
  type SpreadCategory,
  type DrawnCard,
} from "@/lib/tarot/spreads";
import {
  getCard,
  getCardImagePath,
  shuffleDeck,
  CARD_BACK_IMAGE,
} from "@/lib/tarot/cards";
import {
  TAROT_SPREAD_KEY,
  TAROT_DRAW_KEY,
  type TarotSpreadSelection,
  type TarotDrawResult,
} from "@/lib/tarot/session";
import ProgressSteps from "@/components/concern/ProgressSteps";

type Phase = "pick" | "direction";
type Direction = "upright" | "reversed";

export default function TarotDrawPage() {
  const router = useRouter();
  const [selection, setSelection] = useState<TarotSpreadSelection | null>(null);
  const [deck, setDeck] = useState<number[]>([]);
  const [slots, setSlots] = useState<(number | null)[]>([]);
  const [directions, setDirections] = useState<Direction[]>([]);
  const [phase, setPhase] = useState<Phase>("pick");

  useEffect(() => {
    const raw =
      typeof window !== "undefined"
        ? sessionStorage.getItem(TAROT_SPREAD_KEY)
        : null;
    if (!raw) {
      router.replace("/tarot");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as TarotSpreadSelection;
      const count = SPREAD_INFO[parsed.spreadType].cardCount;
      setSelection(parsed);
      setDeck(shuffleDeck());
      setSlots(Array(count).fill(null));
      setDirections(Array(count).fill("upright"));
    } catch {
      router.replace("/tarot");
    }
  }, [router]);

  const labels = useMemo(
    () =>
      selection
        ? getPositionLabels(
            selection.spreadType as SpreadType,
            selection.spreadCategory as SpreadCategory
          )
        : [],
    [selection]
  );

  if (!selection) {
    return (
      <main className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">카드를 섞는 중…</p>
      </main>
    );
  }

  const info = SPREAD_INFO[selection.spreadType];
  const filledCount = slots.filter((s) => s !== null).length;
  const allFilled = filledCount === info.cardCount;
  const nextSlot = slots.findIndex((s) => s === null);

  const pickCard = (cardId: number) => {
    if (nextSlot === -1) return;
    setSlots((prev) => {
      const copy = [...prev];
      copy[nextSlot] = cardId;
      return copy;
    });
    setDeck((prev) => prev.filter((id) => id !== cardId));
  };

  const clearSlot = (slotIdx: number) => {
    const cardId = slots[slotIdx];
    if (cardId === null) return;
    setSlots((prev) => {
      const copy = [...prev];
      copy[slotIdx] = null;
      return copy;
    });
    setDeck((prev) => [...prev, cardId]);
  };

  const toggleDirection = (slotIdx: number) => {
    setDirections((prev) => {
      const copy = [...prev];
      copy[slotIdx] = copy[slotIdx] === "upright" ? "reversed" : "upright";
      return copy;
    });
  };

  const handleReading = () => {
    const drawnCards: DrawnCard[] = slots.map((cardId, i) => ({
      position: i,
      label: labels[i] ?? `카드 ${i + 1}`,
      card_id: cardId as number,
      direction: directions[i],
    }));
    const payload: TarotDrawResult = { ...selection, drawnCards };
    sessionStorage.setItem(TAROT_DRAW_KEY, JSON.stringify(payload));
    router.push("/tarot/reading");
  };

  return (
    <main className="flex flex-1 flex-col items-center py-6 w-full animate-fade-in">
      <div className="mb-5">
        <ProgressSteps current={3} />
      </div>

      <div className="w-full max-w-md mx-auto px-5">
        <h1 className="font-display text-[22px] text-eye-purple font-bold text-center">
          {phase === "pick" ? "카드를 골라봐" : "카드 방향을 정해줘"}
        </h1>
        <p className="text-[12px] text-text-light text-center mt-1">
          {phase === "pick"
            ? `${info.label} · ${info.cardCount}장 중 ${filledCount}장 골랐어`
            : "마음 가는 대로 정·역을 골라줘"}
        </p>
      </div>

      {/* 슬롯 */}
      <div className="w-full max-w-md mx-auto px-5 mt-6">
        <div className="flex flex-wrap justify-center gap-3">
          {slots.map((cardId, i) => {
            const dir = directions[i];
            return (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <span
                  className={`text-[11px] font-bold ${
                    nextSlot === i && phase === "pick"
                      ? "text-lilac-deep"
                      : "text-text-light"
                  }`}
                >
                  {labels[i] ?? `카드 ${i + 1}`}
                </span>
                <div
                  className="relative w-[64px] aspect-[2/3] rounded-lg overflow-hidden border-2"
                  style={{
                    borderColor:
                      nextSlot === i && phase === "pick"
                        ? info.accent
                        : "#E8DEF5",
                    background: "#1F1735",
                  }}
                >
                  {cardId !== null ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={getCardImagePath(cardId)}
                      alt=""
                      className="w-full h-full object-cover transition-transform"
                      style={{
                        transform:
                          phase === "direction" && dir === "reversed"
                            ? "rotate(180deg)"
                            : "none",
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/30 text-lg">
                      {i + 1}
                    </div>
                  )}
                  {cardId !== null && phase === "pick" && (
                    <button
                      onClick={() => clearSlot(i)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/55 text-white text-[11px] leading-none flex items-center justify-center"
                      aria-label="카드 비우기"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {phase === "direction" && cardId !== null && (
                  <DirectionToggle
                    value={dir}
                    onToggle={() => toggleDirection(i)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 덱 (pick phase 만) */}
      {phase === "pick" && (
        <div className="w-full mt-7">
          <div className="flex gap-2 overflow-x-auto px-5 pb-3 scrollbar-thin snap-x">
            {deck.map((cardId) => (
              <button
                key={cardId}
                onClick={() => pickCard(cardId)}
                disabled={allFilled}
                className="flex-shrink-0 w-[52px] aspect-[2/3] rounded-lg overflow-hidden border border-white/40 shadow-sm snap-center active:scale-95 transition disabled:opacity-40"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={CARD_BACK_IMAGE}
                  alt="카드 뒷면"
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
          <p className="text-[11px] text-text-light/60 text-center mt-1">
            옆으로 넘기며 마음에 드는 카드를 눌러봐
          </p>
        </div>
      )}

      {/* CTA */}
      <div className="w-full max-w-md mx-auto px-5 mt-8 flex flex-col gap-2.5">
        {phase === "pick" ? (
          <button
            onClick={() => setPhase("direction")}
            disabled={!allFilled}
            className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            카드 방향 선택
          </button>
        ) : (
          <>
            <button
              onClick={handleReading}
              className="w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition"
            >
              고민 상담 시작하기
            </button>
            <button
              onClick={() => setPhase("pick")}
              className="w-full py-3 rounded-xl border border-lilac-mid/50 text-text-light font-bold text-[14px] hover:bg-lilac-soft/40 transition"
            >
              카드 다시 고르기
            </button>
          </>
        )}
      </div>
    </main>
  );
}

function DirectionToggle({
  value,
  onToggle,
}: {
  value: Direction;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="relative flex w-[56px] h-[24px] rounded-full bg-lilac-soft p-0.5 text-[11px] font-bold"
      aria-label="카드 방향 전환"
    >
      <span
        className="absolute top-0.5 bottom-0.5 w-[26px] rounded-full bg-white shadow-sm transition-all"
        style={{ left: value === "upright" ? "2px" : "28px" }}
      />
      <span
        className={`relative z-10 flex-1 text-center leading-[20px] ${
          value === "upright" ? "text-eye-purple" : "text-text-light/50"
        }`}
      >
        정
      </span>
      <span
        className={`relative z-10 flex-1 text-center leading-[20px] ${
          value === "reversed" ? "text-eye-purple" : "text-text-light/50"
        }`}
      >
        역
      </span>
    </button>
  );
}
