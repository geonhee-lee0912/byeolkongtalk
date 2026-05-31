"use client";

import Image from "next/image";
import { getCard, getCardImagePath } from "@/lib/tarot/cards";
import type { DrawnCard } from "@/lib/tarot/spreads";

interface Props {
  role: "user" | "assistant";
  content: string;
  showAvatar?: boolean;
  showName?: boolean;
  cardIndex?: number | null;
  showCardImage?: boolean;
  drawnCards?: DrawnCard[];
  streaming?: boolean;
}

export default function ChatBubble({
  role,
  content,
  showAvatar,
  showName,
  cardIndex,
  showCardImage,
  drawnCards,
  streaming,
}: Props) {
  if (role === "user") {
    return (
      <div className="flex justify-end mb-3 animate-fade-in">
        <div className="max-w-[82%] px-4 py-3 bg-lilac-deep text-white rounded-2xl rounded-br-md text-[14px] leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      </div>
    );
  }

  const dc =
    cardIndex != null && drawnCards ? drawnCards[cardIndex] ?? null : null;
  const card = dc ? getCard(dc.card_id) : null;

  return (
    <div className="flex items-start gap-2 mb-3 animate-fade-in">
      {/* 프로필 컬럼 — 턴의 첫 버블 + 카드 해석 시작 버블에만 노출 */}
      <div className="w-8 shrink-0">
        {showAvatar && (
          <div className="relative w-8 h-8 rounded-full overflow-hidden bg-cream-warm border border-lilac-mid/40">
            <Image
              src="/profile.png"
              alt="별콩이"
              fill
              sizes="32px"
              className="object-cover"
            />
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {showName && (
          <span className="text-[12px] font-bold text-text-light mb-1.5 ml-1">
            별콩이
          </span>
        )}

        {showCardImage && card && dc && (
          <div className="mb-2 ml-0.5 flex items-end gap-2 w-fit animate-fade-in">
            <div className="relative w-14 h-[88px] rounded-md overflow-hidden ring-1 ring-gold/60 shadow-sm shrink-0">
              <Image
                src={getCardImagePath(dc.card_id)}
                alt={card.name_kr}
                fill
                sizes="56px"
                className={`object-cover ${
                  dc.direction === "reversed" ? "rotate-180" : ""
                }`}
              />
            </div>
            <div className="text-[11px] leading-tight pb-1">
              <p className="font-bold text-eye-purple">{card.name_kr}</p>
              <p className="text-text-light mt-px whitespace-nowrap">
                {dc.label} · {dc.direction === "upright" ? "정방향" : "역방향"}
              </p>
            </div>
          </div>
        )}

        <div className="w-full px-4 py-3 bg-cream-warm text-eye-purple rounded-2xl rounded-tl-md text-[14px] leading-relaxed whitespace-pre-wrap border border-lilac-mid/20">
          {content || (
            <span className="inline-flex gap-1 items-center py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-lilac-deep/50 animate-pulse-soft" />
              <span
                className="w-1.5 h-1.5 rounded-full bg-lilac-deep/50 animate-pulse-soft"
                style={{ animationDelay: "0.15s" }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-lilac-deep/50 animate-pulse-soft"
                style={{ animationDelay: "0.3s" }}
              />
            </span>
          )}
          {streaming && content && (
            <span className="inline-block w-[2px] h-4 bg-lilac-deep/60 ml-0.5 animate-pulse align-middle" />
          )}
        </div>
      </div>
    </div>
  );
}
