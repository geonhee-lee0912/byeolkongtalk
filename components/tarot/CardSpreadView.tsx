"use client";

import Image from "next/image";
import { getCard, getCardImagePath } from "@/lib/tarot/cards";
import type { DrawnCard, SpreadType } from "@/lib/tarot/spreads";

interface Props {
  drawnCards: DrawnCard[];
  spreadType: SpreadType;
  activeIndex?: number | null;
}

export default function CardSpreadView({
  drawnCards,
  spreadType,
  activeIndex = null,
}: Props) {
  const inner = (() => {
    if (spreadType === "one_card") {
      return (
        <div className="flex justify-center">
          <CardTile dc={drawnCards[0]} active={true} size="lg" />
        </div>
      );
    }
    if (spreadType === "relationship_5") {
      return (
        <div className="flex items-center justify-center gap-4">
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <CardTile
                key={i}
                dc={drawnCards[i]}
                active={activeIndex === i}
                size="xs"
              />
            ))}
          </div>
          <CardTile dc={drawnCards[4]} active={activeIndex === 4} size="sm" />
        </div>
      );
    }
    // 비관계 5장 (deep_feelings_5, reunion_5, new_love_5): 3+2 그리드
    if (drawnCards.length === 5) {
      return (
        <div className="flex flex-col gap-4 items-center">
          {[[0, 1, 2], [3, 4]].map((row, rowIdx) => (
            <div key={rowIdx} className="flex items-start justify-center gap-3">
              {row.map((i) => (
                <CardTile
                  key={i}
                  dc={drawnCards[i]}
                  active={activeIndex === i}
                  size="xs"
                />
              ))}
            </div>
          ))}
        </div>
      );
    }
    // 6장: 2행 x 3열 (상단 3, 하단 3)
    if (drawnCards.length === 6) {
      return (
        <div className="flex flex-col gap-4 items-center">
          {[[0, 1, 2], [3, 4, 5]].map((row, rowIdx) => (
            <div key={rowIdx} className="flex items-start justify-center gap-3">
              {row.map((i) => (
                <CardTile
                  key={i}
                  dc={drawnCards[i]}
                  active={activeIndex === i}
                  size="xs"
                />
              ))}
            </div>
          ))}
        </div>
      );
    }
    // 7장: 상단 3 + 중단 3 + 하단 1(중앙) 피라미드
    if (drawnCards.length === 7) {
      return (
        <div className="flex flex-col gap-4 items-center">
          {[[0, 1, 2], [3, 4, 5]].map((row, rowIdx) => (
            <div key={rowIdx} className="flex items-start justify-center gap-3">
              {row.map((i) => (
                <CardTile
                  key={i}
                  dc={drawnCards[i]}
                  active={activeIndex === i}
                  size="xs"
                />
              ))}
            </div>
          ))}
          <CardTile dc={drawnCards[6]} active={activeIndex === 6} size="sm" />
        </div>
      );
    }
    const size = spreadType === "two_card" ? "md" : "sm";
    return (
      <div className="flex items-start justify-center gap-5">
        {drawnCards.map((dc, i) => (
          <CardTile key={i} dc={dc} active={activeIndex === i} size={size} />
        ))}
      </div>
    );
  })();

  return (
    <div className="relative rounded-2xl bg-night p-5 overflow-hidden border border-lilac-mid/20">
      <BackgroundStars />
      <div className="relative z-10">{inner}</div>
    </div>
  );
}

const STAR_POSITIONS = [
  { top: "10%", left: "8%", size: 3, delay: 0 },
  { top: "18%", left: "88%", size: 2, delay: 0.6 },
  { top: "32%", left: "18%", size: 2, delay: 1.2 },
  { top: "28%", left: "72%", size: 3, delay: 0.3 },
  { top: "48%", left: "4%", size: 2, delay: 1.8 },
  { top: "52%", left: "94%", size: 2, delay: 0.9 },
  { top: "66%", left: "12%", size: 3, delay: 2.1 },
  { top: "72%", left: "82%", size: 2, delay: 0.4 },
  { top: "86%", left: "32%", size: 2, delay: 1.5 },
  { top: "82%", left: "60%", size: 3, delay: 0.7 },
  { top: "14%", left: "48%", size: 2, delay: 2.3 },
  { top: "92%", left: "8%", size: 2, delay: 1.0 },
];

function BackgroundStars() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {STAR_POSITIONS.map((s, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white animate-star-twinkle"
          style={{
            top: s.top,
            left: s.left,
            width: `${s.size}px`,
            height: `${s.size}px`,
            boxShadow: `0 0 ${s.size * 2}px rgba(255,255,255,0.6)`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

const SIZE_MAP = {
  xs: { w: "w-[52px]", h: "h-[80px]", name: "text-[10px]", label: "text-[9px]", gap: "gap-1.5" },
  sm: { w: "w-[64px]", h: "h-[100px]", name: "text-[11px]", label: "text-[10px]", gap: "gap-2" },
  md: { w: "w-[88px]", h: "h-[136px]", name: "text-[12px]", label: "text-[11px]", gap: "gap-2.5" },
  lg: { w: "w-[120px]", h: "h-[188px]", name: "text-[14px]", label: "text-[12px]", gap: "gap-3" },
} as const;

interface CardTileProps {
  dc: DrawnCard;
  active: boolean;
  size: "xs" | "sm" | "md" | "lg";
}

function CardTile({ dc, active, size }: CardTileProps) {
  const card = getCard(dc.card_id);
  if (!card) return null;

  const s = SIZE_MAP[size];
  const directionKr = dc.direction === "upright" ? "정" : "역";

  return (
    <div className={`flex flex-col items-center ${s.gap}`}>
      <span
        className={`${s.label} font-bold tracking-wide transition-colors ${
          active ? "text-gold" : "text-white/70"
        }`}
      >
        {dc.label}
      </span>

      <div
        className={`relative ${s.w} ${s.h} rounded-lg overflow-hidden transition-all duration-500 ${
          active
            ? "ring-2 ring-gold shadow-[0_0_24px_rgba(232,194,106,0.45)] scale-105"
            : "ring-1 ring-white/15 opacity-[0.95]"
        }`}
      >
        <Image
          src={getCardImagePath(dc.card_id)}
          alt={card.name_kr}
          fill
          sizes="120px"
          className={`object-cover ${dc.direction === "reversed" ? "rotate-180" : ""}`}
        />
      </div>

      <div className="text-center">
        <p
          className={`${s.name} font-bold leading-tight ${
            active ? "text-gold" : "text-white/80"
          }`}
        >
          {card.name_kr}
        </p>
        <p className={`${s.label} ${active ? "text-gold/80" : "text-white/50"}`}>
          {directionKr}
        </p>
      </div>
    </div>
  );
}
