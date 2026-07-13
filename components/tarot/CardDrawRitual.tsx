"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { shuffleDeck, CARD_BACK_IMAGE } from "@/lib/tarot/cards";
import type { DrawnCard } from "@/lib/tarot/spreads";

type CardDirection = "upright" | "reversed";
type Phase = "pick" | "direction";

type Rect = { x: number; y: number; w: number; h: number };
type Flight = {
  cardId: number;
  slotIndex: number;
  from: Rect;
  to: Rect;
  active: boolean;
};

const CARD_W = 52;
const CARD_H = 80;
const CARD_OVERLAP = 18;
const CARD_STRIDE = CARD_W - CARD_OVERLAP; // 34px per card (overlap으로 밀도↑)
const FLIGHT_MS = 440;

interface CardDrawRitualProps {
  cardCount: number;
  slotLabels: string[];
  accent: string;
  ritualLabel: string; // breathing pill + section divider 표시용
  completeLabel?: string; // direction phase 완료 버튼 라벨 (기본 "결과 보기")
  relationshipLayout?: boolean; // true면 2x2 + 중앙 5번 배치
  backLabel?: string; // pick phase 좌측 버튼 라벨 (없으면 버튼 숨김)
  onBack?: () => void;
  onComplete: (drawn: DrawnCard[]) => void;
  /** true면 호흡 pill·섹션 디바이더·별콩이 프로필 숨김 (ClarifierSheet용 슬림 모드) */
  slim?: boolean;
  /** 이미 뽑힌 card_id 목록 — shuffleDeck 결과에서 제외 */
  excludeCardIds?: number[];
}

export default function CardDrawRitual({
  cardCount,
  slotLabels,
  accent,
  ritualLabel,
  completeLabel,
  relationshipLayout,
  backLabel,
  onBack,
  onComplete,
  slim = false,
  excludeCardIds,
}: CardDrawRitualProps) {
  const [mounted, setMounted] = useState(false);
  const [deck, setDeck] = useState<number[]>([]);
  const [isShuffling, setIsShuffling] = useState(true);
  const [slotCards, setSlotCards] = useState<(number | null)[]>([]);
  const [directions, setDirections] = useState<CardDirection[]>([]);
  const [pendingCardId, setPendingCardId] = useState<number | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [isCompact, setIsCompact] = useState(false);

  // viewport 세로가 부족한 디바이스(iPhone SE 등)에서만 하단 CTA sticky
  useEffect(() => {
    const check = () => setIsCompact(window.innerHeight < 820);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // compact 디바이스 첫 진입: 덱/스크롤바/버튼이 한 화면에 보이도록 자동 스크롤
  useEffect(() => {
    if (!mounted || !isCompact) return;
    let rafId = 0;
    const t = setTimeout(() => {
      const maxScroll =
        document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll <= 8) return;
      const startY = window.scrollY;
      const distance = maxScroll - startY;
      const duration = 900;
      const startTime = performance.now();
      const ease = (x: number) =>
        x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
      const step = (now: number) => {
        const t2 = Math.min(1, (now - startTime) / duration);
        window.scrollTo(0, startY + distance * ease(t2));
        if (t2 < 1) rafId = requestAnimationFrame(step);
      };
      rafId = requestAnimationFrame(step);
    }, 450);
    return () => {
      clearTimeout(t);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [mounted, isCompact]);

  // 덱 섞기 + 슬롯/방향 초기화
  useEffect(() => {
    const full = shuffleDeck();
    setDeck(excludeCardIds && excludeCardIds.length > 0
      ? full.filter((id) => !excludeCardIds.includes(id))
      : full
    );
    setSlotCards(new Array(cardCount).fill(null));
    setDirections(new Array(cardCount).fill("upright"));
    setMounted(true);
    const timer = setTimeout(() => setIsShuffling(false), 500);
    return () => clearTimeout(timer);
  }, [cardCount]);

  const pickedSlotByCard = useMemo(() => {
    const m = new Map<number, number>();
    slotCards.forEach((c, i) => {
      if (c !== null) m.set(c, i);
    });
    return m;
  }, [slotCards]);

  if (!mounted) {
    return (
      <div className="flex flex-1 items-center justify-center px-5">
        <p className="text-text-light text-sm">카드를 섞는 중…</p>
      </div>
    );
  }

  const firstEmptySlot = slotCards.findIndex((c) => c === null);
  const allFilled = slotCards.length > 0 && firstEmptySlot === -1;
  const activeSlot =
    activeSlotIndex !== null && slotCards[activeSlotIndex] === null
      ? activeSlotIndex
      : firstEmptySlot;
  const canProceed = allFilled;

  const commitPick = (cardId: number, slotIdx: number) => {
    setSlotCards((prev) => prev.map((c, i) => (i === slotIdx ? cardId : c)));
    setPendingCardId(null);
    setActiveSlotIndex(null);
  };

  const confirmPick = () => {
    if (pendingCardId === null || flight) return;
    const slotIdx = activeSlot;
    if (slotIdx < 0) return;
    if (slotCards[slotIdx] !== null) return;

    const deckEl = document.querySelector<HTMLElement>(
      '[data-deck-center="true"]'
    );
    const slotEl = document.querySelector<HTMLElement>(
      `[data-slot="${slotIdx}"]`
    );
    const flyingId = pendingCardId;

    if (!deckEl || !slotEl) {
      commitPick(flyingId, slotIdx);
      return;
    }

    const fromRect = deckEl.getBoundingClientRect();
    const toRect = slotEl.getBoundingClientRect();

    setFlight({
      cardId: flyingId,
      slotIndex: slotIdx,
      from: {
        x: fromRect.left,
        y: fromRect.top,
        w: fromRect.width,
        h: fromRect.height,
      },
      to: {
        x: toRect.left,
        y: toRect.top,
        w: toRect.width,
        h: toRect.height,
      },
      active: false,
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFlight((prev) => (prev ? { ...prev, active: true } : prev));
      });
    });

    setTimeout(() => {
      commitPick(flyingId, slotIdx);
      setFlight(null);
    }, FLIGHT_MS);
  };

  const removeCard = (idx: number) => {
    if (flight) return;
    setSlotCards((prev) => prev.map((c, i) => (i === idx ? null : c)));
    setDirections((prev) => prev.map((d, i) => (i === idx ? "upright" : d)));
    setActiveSlotIndex(idx);
    setPendingCardId(null);
  };

  const selectSlot = (idx: number) => {
    if (flight) return;
    if (slotCards[idx] === null) {
      setActiveSlotIndex(idx);
    }
  };

  const setDir = (idx: number, dir: CardDirection) => {
    setDirections((prev) => {
      const n = [...prev];
      n[idx] = dir;
      return n;
    });
  };

  const backToPick = () => {
    setPhase("pick");
  };

  const goToDirection = () => {
    if (!allFilled) return;
    setPhase("direction");
  };

  const handleComplete = () => {
    const drawn: DrawnCard[] = slotCards.map((cardId, i) => ({
      position: i,
      label: slotLabels[i] ?? `카드 ${i + 1}`,
      card_id: cardId as number,
      direction: directions[i] ?? "upright",
    }));
    onComplete(drawn);
  };

  const containerPb = isCompact
    ? phase === "direction"
      ? "pb-[180px]"
      : "pb-28"
    : "pb-16";

  return (
    <div
      className={`flex flex-1 flex-col items-center w-full animate-fade-in ${containerPb}`}
    >
      <div className="w-full max-w-md mx-auto px-5">
        {/* 호흡 가이드 + 스프레드 요약 pill — slim 모드에서 숨김 */}
        {!slim && (
          <div className="flex justify-center mb-5">
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full"
              style={{
                background:
                  "linear-gradient(135deg, #FFF8F0 0%, #F7ECDB 60%, #F2E2D2 100%)",
                border: "1px solid rgba(232,194,106,0.45)",
                boxShadow: "0 2px 8px rgba(232,194,106,0.25)",
              }}
            >
              <span className="text-[13px]">✨</span>
              <span
                className="text-[11px] font-black tracking-wide"
                style={{ color: accent }}
              >
                {ritualLabel}
              </span>
              <span className="w-[1px] h-3 bg-gold/40" />
              <span className="text-[12px] font-medium text-[#8A6A2A]">
                숨 고르고 고민에 집중해봐
              </span>
            </div>
          </div>
        )}

        {/* 섹션 디바이더 — slim 모드에서 숨김 */}
        {!slim && (
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-lilac-soft" />
            <span className="text-[11px] font-bold text-text-light tracking-[0.15em]">
              {phase === "direction" ? "방향 선택" : "카드 뽑기"}
            </span>
            <div className="flex-1 h-px bg-lilac-soft" />
          </div>
        )}

        {/* 별콩이 + 메시지 — slim 모드에서 프로필 이미지 숨김 */}
        <div className={`flex flex-col items-center ${slim ? "mb-3" : "mb-5"}`}>
          {!slim && (
            <div className="relative w-14 h-14 mb-2">
              <div className="absolute inset-0 bg-gold/30 rounded-full blur-xl scale-110" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/profile.png"
                alt="별콩이"
                className="relative w-full h-full object-contain animate-float"
              />
            </div>
          )}
          {phase === "pick" ? (
            <>
              <p className="font-display text-[17px] text-eye-purple leading-tight text-center">
                {allFilled ? (
                  <>카드를 다 골랐네!</>
                ) : cardCount > 1 && activeSlot >= 0 ? (
                  <>
                    <span
                      className="font-black tabular-nums"
                      style={{ color: accent }}
                    >
                      {activeSlot + 1}
                      <span className="text-text-light/50 mx-0.5">/</span>
                      {cardCount}
                    </span>
                    {"  "}
                    <span style={{ color: accent }}>
                      {slotLabels[activeSlot]}
                    </span>
                    {" 자리 카드를 골라줘"}
                  </>
                ) : (
                  "마음이 끌리는 카드를 골라봐"
                )}
              </p>
              <p className="text-[12px] text-text-light/85 mt-1.5 leading-relaxed text-center">
                {allFilled
                  ? "이제 카드 방향을 정해볼까?"
                  : "“별이 이끄는 대로, 손끝이 멈추는 그 카드로”"}
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-[17px] text-eye-purple leading-tight text-center">
                카드 방향도 정해줄래?
              </p>
              <p className="text-[12px] text-text-light/85 mt-1.5 leading-relaxed text-center">
                &ldquo;정·역에 따라 별이 전하는 결이 달라져&rdquo;
              </p>
            </>
          )}
        </div>

        {/* 슬롯 */}
        <SlotRow
          labels={slotLabels}
          slotCards={slotCards}
          directions={directions}
          activeSlot={activeSlot}
          phase={phase}
          accent={accent}
          relationshipLayout={!!relationshipLayout}
          flightSlotIndex={flight?.slotIndex ?? null}
          onToggleDirection={setDir}
          onRemove={removeCard}
          onSelectSlot={selectSlot}
        />
      </div>

      {/* pick 단계: 가로 스와이프 덱 */}
      {phase === "pick" && (
        <div className="w-full max-w-md mx-auto mt-6">
          <HorizontalDeck
            deck={deck}
            pickedSlotByCard={pickedSlotByCard}
            pendingCardId={pendingCardId}
            hiddenCardId={flight?.cardId ?? null}
            onTap={setPendingCardId}
            accent={accent}
            isShuffling={isShuffling}
            totalSlots={cardCount}
          />
        </div>
      )}

      {/* pick 단계: 뒤로 + 카드 선택/방향 선택 (동일 너비) */}
      {phase === "pick" &&
        (() => {
          const pickLabel = allFilled ? "카드 방향 선택" : "카드 선택";
          const pickAction = allFilled ? goToDirection : confirmPick;
          const pickDisabled = allFilled
            ? false
            : pendingCardId === null || flight !== null || activeSlot < 0;
          const stickyClass = isCompact
            ? "fixed bottom-0 left-0 right-0 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] bg-cream/92 backdrop-blur-md border-t border-lilac-soft/70 z-40"
            : "w-full max-w-md mx-auto px-5 mt-6";
          return (
            <div
              className={`flex items-center justify-center gap-2 ${stickyClass}`}
            >
              {backLabel && (
                <button
                  onClick={onBack}
                  className="flex-1 max-w-[160px] py-2.5 text-[13px] font-bold text-lilac-deep rounded-full bg-transparent border-2 border-lilac-deep/45 hover:border-lilac-deep/70 hover:bg-lilac-deep/5 transition-colors"
                >
                  {backLabel}
                </button>
              )}
              <button
                onClick={pickAction}
                disabled={pickDisabled}
                className="flex-1 max-w-[160px] py-2.5 text-[13px] font-bold text-white rounded-full active:scale-[0.98] transition-all disabled:opacity-40 disabled:active:scale-100"
                style={{
                  background: accent,
                  boxShadow: pickDisabled ? "none" : `0 6px 18px ${accent}55`,
                }}
              >
                {pickLabel}
              </button>
            </div>
          );
        })()}

      {/* direction 단계: 완료 + 카드 다시 뽑으러 가기 (세로) */}
      {phase === "direction" && (
        <div
          className={`flex flex-col items-center gap-2.5 ${
            isCompact
              ? "fixed bottom-0 left-0 right-0 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),12px)] bg-cream/92 backdrop-blur-md border-t border-lilac-soft/70 z-40"
              : "mt-9"
          }`}
        >
          <button
            onClick={handleComplete}
            disabled={!canProceed}
            className="w-[260px] py-3 text-white rounded-full font-bold text-[14px] active:scale-[0.98] transition-all disabled:opacity-40 disabled:active:scale-100"
            style={{
              background: accent,
              boxShadow: !canProceed ? "none" : `0 6px 18px ${accent}55`,
            }}
          >
            {completeLabel ?? "결과 보기"}
          </button>
          <button
            onClick={backToPick}
            className="w-[260px] py-3 text-[14px] font-bold text-lilac-deep rounded-full bg-transparent border-2 border-lilac-deep/45 hover:border-lilac-deep/70 hover:bg-lilac-deep/5 transition-colors"
          >
            카드 다시 뽑으러 가기
          </button>
        </div>
      )}

      {flight && <FlyingCardOverlay flight={flight} accent={accent} />}
    </div>
  );
}

// ━━━━━━━━━━ 날아가는 카드 오버레이 ━━━━━━━━━━

function FlyingCardOverlay({
  flight,
  accent,
}: {
  flight: Flight;
  accent: string;
}) {
  const target = flight.active ? flight.to : flight.from;
  return (
    <div
      className="fixed pointer-events-none z-[60] rounded-md overflow-hidden"
      style={{
        left: target.x,
        top: target.y,
        width: target.w,
        height: target.h,
        transform: flight.active
          ? "scale(1) rotate(0deg)"
          : "scale(1.18) rotate(-3deg)",
        transformOrigin: "center",
        boxShadow: flight.active
          ? `0 4px 14px ${accent}40`
          : `0 12px 30px ${accent}80`,
        transition: `left ${FLIGHT_MS}ms cubic-bezier(.22,.68,.28,1), top ${FLIGHT_MS}ms cubic-bezier(.22,.68,.28,1), width ${FLIGHT_MS}ms cubic-bezier(.22,.68,.28,1), height ${FLIGHT_MS}ms cubic-bezier(.22,.68,.28,1), transform ${FLIGHT_MS}ms cubic-bezier(.22,.68,.28,1), box-shadow ${FLIGHT_MS}ms ease-out`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={CARD_BACK_IMAGE}
        alt=""
        className="w-full h-full object-cover"
        draggable={false}
      />
    </div>
  );
}

// ━━━━━━━━━━ 가로 스와이프 덱 ━━━━━━━━━━

function HorizontalDeck({
  deck,
  pickedSlotByCard,
  pendingCardId,
  hiddenCardId,
  onTap,
  accent,
  isShuffling,
  totalSlots,
}: {
  deck: number[];
  pickedSlotByCard: Map<number, number>;
  pendingCardId: number | null;
  hiddenCardId: number | null;
  onTap: (cardId: number | null) => void;
  accent: string;
  isShuffling: boolean;
  totalSlots: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [centeredIndex, setCenteredIndex] = useState(0);

  // 드래그 추적 (touch/mouse 공통)
  const dragRef = useRef<{
    startX: number;
    startScroll: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  // 뽑힌 카드도 덱에 그대로 표시 (번호 배지로 식별)
  const visibleCards = deck;

  useEffect(() => {
    if (!scrollRef.current) return;
    const { scrollLeft } = scrollRef.current;
    const idx = Math.round(scrollLeft / CARD_STRIDE);
    setCenteredIndex(Math.max(0, Math.min(visibleCards.length - 1, idx)));
  }, [visibleCards.length]);

  // 중앙 카드 = pending 카드 자동 동기화 (뽑힌 카드는 제외)
  useEffect(() => {
    const centerCard = visibleCards[centeredIndex];
    if (centerCard == null) return;
    if (pickedSlotByCard.has(centerCard)) {
      if (pendingCardId !== null) onTap(null);
    } else if (centerCard !== pendingCardId) {
      onTap(centerCard);
    }
  }, [centeredIndex, visibleCards, pendingCardId, onTap, pickedSlotByCard]);

  // rAF 쓰로틀 — 휠/트랙패드 빠른 스크롤 시 centeredIndex 깜빡임 방지
  const scrollRafRef = useRef<number | null>(null);
  const handleScroll = () => {
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      if (!scrollRef.current) return;
      const idx = Math.round(scrollRef.current.scrollLeft / CARD_STRIDE);
      setCenteredIndex(Math.max(0, Math.min(visibleCards.length - 1, idx)));
    });
  };

  const jumpTo = (i: number, smooth = true) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({
      left: i * CARD_STRIDE,
      behavior: smooth ? "smooth" : "auto",
    });
  };

  // 한 장 뽑히면 마커를 옆 카드로 자동 이동 — 바로 다음 카드 선택 가능하게
  // 오른쪽 끝 카드를 뽑았는데 뽑을 카드가 남았으면 왼쪽으로 이동
  const prevPickedCountRef = useRef(0);
  useEffect(() => {
    const pickedCount = pickedSlotByCard.size;
    const prev = prevPickedCountRef.current;
    prevPickedCountRef.current = pickedCount;
    if (pickedCount > prev && pickedCount < totalSlots) {
      const last = visibleCards.length - 1;
      const target =
        centeredIndex < last ? centeredIndex + 1 : centeredIndex - 1;
      if (target >= 0 && target !== centeredIndex) {
        jumpTo(target, true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedSlotByCard, totalSlots, visibleCards.length]);

  // 드래그 스크롤 — touch/mouse 공통, 1.8배 가속
  const DRAG_MULTIPLIER = 1.8;
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!scrollRef.current) return;
    dragRef.current = {
      startX: e.clientX,
      startScroll: scrollRef.current.scrollLeft,
      moved: false,
    };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !scrollRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    if (Math.abs(dx) > 4) dragRef.current.moved = true;
    if (dragRef.current.moved) {
      scrollRef.current.scrollLeft =
        dragRef.current.startScroll - dx * DRAG_MULTIPLIER;
    }
  };
  const handlePointerUp = () => {
    if (dragRef.current?.moved) {
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 50);
    }
    dragRef.current = null;
  };

  const sidePadding = `calc(50% - ${CARD_W / 2}px)`;

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="flex overflow-x-auto scrollbar-hide cursor-grab active:cursor-grabbing select-none"
        style={{
          paddingInline: sidePadding,
          paddingTop: 18,
          paddingBottom: 18,
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          overflowY: "visible",
          touchAction: "pan-x",
        }}
      >
        {visibleCards.map((cardId, i) => {
          const distance = Math.abs(i - centeredIndex);
          const isCenter = distance === 0;
          const isPending = cardId === pendingCardId;
          const isFlying = cardId === hiddenCardId;
          const isPicked = pickedSlotByCard.has(cardId);
          // 중앙에서 멀수록 scale/opacity 감소, z-index 낮아짐 (겹침 순서)
          const scale = isCenter
            ? 1.18
            : distance === 1
            ? 1.0
            : distance === 2
            ? 0.9
            : 0.82;
          const opacity = isCenter
            ? 1
            : distance === 1
            ? 0.85
            : distance === 2
            ? 0.6
            : 0.4;
          return (
            <span
              key={cardId}
              className="flex-shrink-0 inline-block animate-deck-deal"
              style={{
                marginLeft: i === 0 ? 0 : -CARD_OVERLAP,
                animationDelay: `${Math.min(i * 8, 480)}ms`,
                position: "relative",
                zIndex: isCenter ? 30 : 20 - distance,
              }}
            >
              <button
                data-deck-center={isCenter ? "true" : undefined}
                onClick={() => {
                  if (isShuffling) return;
                  if (suppressClickRef.current) return;
                  if (isCenter) {
                    if (!isPicked) onTap(cardId);
                  } else {
                    jumpTo(i);
                  }
                }}
                className="rounded-md overflow-hidden pointer-events-auto block"
                draggable={false}
                style={{
                  width: CARD_W,
                  height: CARD_H,
                  transform: `scale(${scale})${
                    isCenter ? " translateY(-2px)" : ""
                  }`,
                  transformOrigin: "center center",
                  opacity,
                  visibility: isFlying ? "hidden" : "visible",
                  transition:
                    "transform 120ms ease-out, opacity 120ms ease-out, box-shadow 150ms ease-out",
                  boxShadow: isPending
                    ? `0 0 0 2px ${accent}, 0 10px 22px ${accent}66`
                    : isCenter
                    ? "0 6px 16px rgba(0,0,0,0.2)"
                    : "0 1px 3px rgba(0,0,0,0.12)",
                }}
                aria-label={`카드 ${i + 1}`}
              >
                <Image
                  src={CARD_BACK_IMAGE}
                  alt="카드"
                  width={CARD_W}
                  height={CARD_H}
                  className="w-full h-full object-cover pointer-events-none"
                  draggable={false}
                  priority={i < 10}
                />
              </button>
            </span>
          );
        })}
      </div>

      {/* 커스텀 스크롤바 */}
      <DeckScrollbar
        accent={accent}
        total={deck.length}
        deck={deck}
        pickedSlotByCard={pickedSlotByCard}
        visibleCards={visibleCards}
        centeredIndex={centeredIndex}
        onJump={(i, smooth) => jumpTo(i, smooth)}
      />
    </div>
  );
}

// ━━━━━━━━━━ 커스텀 스크롤바 ━━━━━━━━━━

function DeckScrollbar({
  accent,
  total,
  deck,
  pickedSlotByCard,
  visibleCards,
  centeredIndex,
  onJump,
}: {
  accent: string;
  total: number;
  deck: number[];
  pickedSlotByCard: Map<number, number>;
  visibleCards: number[];
  centeredIndex: number;
  onJump: (i: number, smooth?: boolean) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const ratio =
    visibleCards.length <= 1 ? 0 : centeredIndex / (visibleCards.length - 1);

  const handlePointer = (clientX: number, smooth = false) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const r = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const targetIdx = Math.round(r * Math.max(0, visibleCards.length - 1));
    onJump(targetIdx, smooth);
  };

  // 10장마다 눈금 (10, 20, 30, 40, 50, 60, 70)
  const tickPositions = [10, 20, 30, 40, 50, 60, 70];

  // 이미 뽑힌 카드의 덱 내 인덱스 → {idx, slotNum}
  const pickedMarkers = deck
    .map((id, i) => {
      const slotIdx = pickedSlotByCard.get(id);
      return slotIdx === undefined ? null : { deckIdx: i, slotNum: slotIdx + 1 };
    })
    .filter((m): m is { deckIdx: number; slotNum: number } => m !== null);

  return (
    <div className="mt-2 px-4">
      {/* 뽑힌 카드 마커 행 — 트랙 위 (지도 핀 모양, 클릭하면 해당 카드로 점프) */}
      <div className="relative h-6 mb-1">
        {pickedMarkers.map(({ deckIdx, slotNum }) => (
          <button
            key={deckIdx}
            onClick={() => onJump(deckIdx, true)}
            className="absolute top-0 active:scale-90 transition-transform pointer-events-auto"
            style={{
              left: `calc(${(deckIdx / (total - 1)) * 100}% - 10px)`,
              width: 20,
              height: 24,
            }}
            aria-label={`${slotNum}번 카드 위치로 이동`}
          >
            <svg
              viewBox="0 0 20 24"
              width="20"
              height="24"
              style={{
                filter: `drop-shadow(0 2px 3px ${accent}66)`,
                display: "block",
              }}
            >
              <path
                d="M10 0 C4.48 0 0 4.48 0 10 C0 17.5 10 24 10 24 S20 17.5 20 10 C20 4.48 15.52 0 10 0 Z"
                fill={accent}
              />
            </svg>
            <span className="absolute left-0 right-0 top-[5px] text-center text-white text-[10px] font-black tabular-nums leading-none pointer-events-none">
              {slotNum}
            </span>
          </button>
        ))}
      </div>
      {/* 트랙 */}
      <div
        ref={trackRef}
        onPointerDown={(e) => {
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
          handlePointer(e.clientX, true);
        }}
        onPointerMove={(e) => {
          if (dragging) handlePointer(e.clientX, false);
        }}
        onPointerUp={(e) => {
          setDragging(false);
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => setDragging(false)}
        className="relative h-1.5 bg-lilac-soft rounded-full cursor-pointer touch-none select-none"
      >
        {/* 10장마다 눈금 */}
        {tickPositions.map((n) => (
          <div
            key={n}
            className="absolute top-0 h-full w-[1.5px] rounded-full pointer-events-none"
            style={{
              left: `${(n / total) * 100}%`,
              background: `${accent}55`,
            }}
          />
        ))}

        {/* 뽑힌 카드 위치 — 트랙 상 작은 dot (위 마커와 시각 연결) */}
        {pickedMarkers.map(({ deckIdx }) => (
          <div
            key={deckIdx}
            className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full pointer-events-none"
            style={{
              left: `calc(${(deckIdx / (total - 1)) * 100}% - 3px)`,
              background: accent,
            }}
          />
        ))}

        {/* 썸 */}
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-full pointer-events-none"
          style={{
            left: `calc(${ratio * 100}% - 14px)`,
            width: 28,
            height: 12,
            background: accent,
            boxShadow: `0 2px 6px ${accent}66`,
            transition: dragging ? "none" : "left 150ms ease-out",
          }}
        >
          {/* 현재 번호 말풍선 — 카드에 가리지 않도록 아래쪽 위치 */}
          <div
            className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-md text-[10px] font-black tabular-nums whitespace-nowrap"
            style={{ background: accent, color: "#fff" }}
          >
            {/* 꼬리 — 썸 쪽(위)으로 */}
            <div
              className="absolute bottom-full left-1/2 -translate-x-1/2"
              style={{
                width: 0,
                height: 0,
                borderLeft: "3px solid transparent",
                borderRight: "3px solid transparent",
                borderBottom: `3px solid ${accent}`,
              }}
            />
            #{centeredIndex + 1}
          </div>
        </div>
      </div>

      {/* 툴팁 공간 확보 */}
      <div className="h-6" />
    </div>
  );
}

// ━━━━━━━━━━ 슬롯 ━━━━━━━━━━

const SLOT_W = 56;
const SLOT_H = 84;

function SlotRow({
  labels,
  slotCards,
  directions,
  activeSlot,
  phase,
  accent,
  relationshipLayout,
  flightSlotIndex,
  onToggleDirection,
  onRemove,
  onSelectSlot,
}: {
  labels: string[];
  slotCards: (number | null)[];
  directions: (CardDirection | null)[];
  activeSlot: number;
  phase: Phase;
  accent: string;
  relationshipLayout: boolean;
  flightSlotIndex: number | null;
  onToggleDirection: (idx: number, dir: CardDirection) => void;
  onRemove: (idx: number) => void;
  onSelectSlot: (idx: number) => void;
}) {
  const renderSlot = (i: number, horizontal?: boolean) => (
    <Slot
      key={i}
      index={i}
      label={labels[i]}
      cardId={slotCards[i] ?? null}
      direction={directions[i] ?? null}
      isCurrent={i === activeSlot && phase === "pick"}
      isIncoming={i === flightSlotIndex}
      phase={phase}
      accent={accent}
      horizontal={horizontal}
      onToggleDirection={onToggleDirection}
      onRemove={onRemove}
      onSelectSlot={onSelectSlot}
    />
  );

  if (relationshipLayout) {
    // 좌측 2x2 그리드 + 우측 중앙 5번 카드 (모두 세로):
    //   [0 나]        [1 상대방]
    //                               [4 관계의 방향]
    //   [2 나의 기대] [3 상대의 기대]
    return (
      <div className="flex items-center justify-center gap-6">
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-5">
            {renderSlot(0)}
            {renderSlot(1)}
          </div>
          <div className="flex items-start gap-5">
            {renderSlot(2)}
            {renderSlot(3)}
          </div>
        </div>
        <div className="flex items-center">{renderSlot(4)}</div>
      </div>
    );
  }

  const rows: number[][] = [labels.map((_, i) => i)];

  return (
    <div className="flex flex-col gap-3 items-center">
      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className="flex items-start gap-6 justify-center">
          {row.map((i) => renderSlot(i))}
        </div>
      ))}
    </div>
  );
}

function Slot({
  index,
  label,
  cardId,
  direction,
  isCurrent,
  isIncoming,
  phase,
  accent,
  horizontal,
  onToggleDirection,
  onRemove,
  onSelectSlot,
}: {
  index: number;
  label: string;
  cardId: number | null;
  direction: CardDirection | null;
  isCurrent: boolean;
  isIncoming: boolean;
  phase: Phase;
  accent: string;
  horizontal?: boolean;
  onToggleDirection: (idx: number, dir: CardDirection) => void;
  onRemove: (idx: number) => void;
  onSelectSlot: (idx: number) => void;
}) {
  const filled = cardId !== null && !isIncoming;
  const showIncomingHint = isIncoming;
  const canSelect = !filled && !isIncoming && phase === "pick";
  const isDirectionPhase = phase === "direction";
  const boxW = horizontal ? SLOT_H : SLOT_W;
  const boxH = horizontal ? SLOT_W : SLOT_H;

  const cardBox = (
    <div
      data-slot={index}
      onClick={canSelect ? () => onSelectSlot(index) : undefined}
      className={`relative rounded-md transition-all ${
        canSelect ? "cursor-pointer" : ""
      }`}
      style={{
        width: boxW,
        height: boxH,
        background: filled ? "transparent" : `${accent}10`,
        border: filled
          ? `2px solid ${accent}`
          : showIncomingHint
          ? `2px solid ${accent}`
          : isCurrent
          ? `2px dashed ${accent}`
          : `2px dashed ${accent}40`,
        boxShadow: showIncomingHint
          ? `0 0 0 4px ${accent}33, 0 6px 18px ${accent}55`
          : isCurrent
          ? `0 0 0 3px ${accent}1f, 0 4px 12px ${accent}33`
          : filled
          ? `0 2px 8px ${accent}30`
          : undefined,
      }}
    >
      <div className="w-full h-full rounded-md overflow-hidden relative">
        {filled && cardId !== null ? (
          horizontal ? (
            <Image
              src={CARD_BACK_IMAGE}
              alt="카드"
              width={SLOT_W}
              height={SLOT_H}
              className="object-cover"
              style={{
                width: SLOT_W,
                height: SLOT_H,
                position: "absolute",
                top: "50%",
                left: "50%",
                marginLeft: -SLOT_W / 2,
                marginTop: -SLOT_H / 2,
                transform: `rotate(${
                  direction === "reversed" ? "-90" : "90"
                }deg)`,
                transition: "transform 300ms ease",
              }}
            />
          ) : (
            <Image
              src={CARD_BACK_IMAGE}
              alt="카드"
              width={SLOT_W}
              height={SLOT_H}
              className="w-full h-full object-cover"
              style={{
                transform:
                  direction === "reversed" ? "rotate(180deg)" : undefined,
                transition: "transform 300ms ease",
              }}
            />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span
              className="text-[14px] font-black tabular-nums"
              style={{ color: `${accent}90` }}
            >
              {index + 1}
            </span>
          </div>
        )}
        {isCurrent && !filled && (
          <div
            className="absolute inset-0 animate-pulse-soft pointer-events-none rounded-md"
            style={{
              boxShadow: `inset 0 0 0 2px ${accent}`,
            }}
          />
        )}
      </div>
      {filled && phase === "pick" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(index);
          }}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white flex items-center justify-center hover:scale-110 active:scale-95 transition-transform z-10"
          style={{
            color: accent,
            border: `1.5px solid ${accent}`,
            boxShadow: `0 2px 6px ${accent}44`,
          }}
          aria-label={`${label} 카드 다시 뽑기`}
        >
          <svg
            width="9"
            height="9"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <line x1="2" y1="2" x2="8" y2="8" />
            <line x1="8" y1="2" x2="2" y2="8" />
          </svg>
        </button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-1.5" style={{ width: boxW }}>
      {isDirectionPhase && (
        <p className="text-[12px] font-black text-eye-purple leading-tight text-center whitespace-nowrap">
          {label}
        </p>
      )}

      {cardBox}

      {!isDirectionPhase && (
        <span
          className="text-[11px] font-black leading-none whitespace-nowrap"
          style={{ color: accent }}
        >
          {label}
        </span>
      )}

      {isDirectionPhase && filled && (
        <DirectionToggle
          accent={accent}
          direction={direction ?? "upright"}
          onChange={(dir) => onToggleDirection(index, dir)}
        />
      )}
    </div>
  );
}

// ━━━━━━━━━━ 정/역 토글 ━━━━━━━━━━

function DirectionToggle({
  accent,
  direction,
  onChange,
}: {
  accent: string;
  direction: CardDirection;
  onChange: (dir: CardDirection) => void;
}) {
  const isReversed = direction === "reversed";
  return (
    <div
      className="relative inline-flex rounded-full p-0.5 mt-0.5"
      style={{ background: `${accent}22` }}
    >
      <span
        aria-hidden
        className="absolute top-0.5 bottom-0.5 rounded-full transition-transform duration-200 ease-out"
        style={{
          width: "calc(50% - 2px)",
          left: 2,
          background: accent,
          transform: isReversed ? "translateX(100%)" : "translateX(0)",
          boxShadow: `0 2px 6px ${accent}55`,
        }}
      />
      <button
        onClick={() => onChange("upright")}
        className="relative z-10 w-8 py-[3px] text-[11px] font-black transition-colors"
        style={{ color: !isReversed ? "#fff" : accent }}
        aria-label="정방향"
        aria-pressed={!isReversed}
      >
        정
      </button>
      <button
        onClick={() => onChange("reversed")}
        className="relative z-10 w-8 py-[3px] text-[11px] font-black transition-colors"
        style={{ color: isReversed ? "#fff" : accent }}
        aria-label="역방향"
        aria-pressed={isReversed}
      >
        역
      </button>
    </div>
  );
}
