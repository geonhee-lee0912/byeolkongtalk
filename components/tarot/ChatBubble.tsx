"use client";

import Image from "next/image";
import { getCard, getCardImagePath } from "@/lib/tarot/cards";
import EmphasisText from "@/components/common/EmphasisText";
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
        <div className="selectable max-w-[82%] px-4 py-3 bg-lilac-deep text-white rounded-2xl rounded-br-sm text-16 whitespace-pre-wrap">
          {content}
        </div>
      </div>
    );
  }

  const dc =
    cardIndex != null && drawnCards ? drawnCards[cardIndex] ?? null : null;
  const card = dc ? getCard(dc.card_id) : null;

  return (
    // selectable — 앱은 기본으로 글자 선택을 막지만 상담 답변은 복사할 수 있게 둔다(스펙 2026-11-07-앱-화면 §5 ①)
    <div className="selectable flex items-start gap-2 mb-3 animate-fade-in">
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
          <span className="text-12 font-bold text-text-light mb-1.5 ml-1">
            별콩이
          </span>
        )}

        <div className="card w-full text-eye-purple rounded-tl-sm text-16 whitespace-pre-wrap">
          {showCardImage && card && dc && (
            // 72×113 · 카드 이야기 첫 말풍선 안 맨 위(말풍선은 문단마다 그대로) — 디자인 다듬기 ② /tarot/reading ③④ 운영자 11-13
            <div className="mb-3 flex items-end gap-2 animate-fade-in">
              <div className="relative w-[72px] h-[113px] rounded-lg overflow-hidden ring-1 ring-gold/60 shadow-card shrink-0">
                <Image
                  src={getCardImagePath(dc.card_id)}
                  alt={card.name_kr}
                  fill
                  sizes="72px"
                  className={`object-cover ${
                    dc.direction === "reversed" ? "rotate-180" : ""
                  }`}
                />
              </div>
              <div className="leading-tight pb-1.5">
                <p className="text-14 font-bold text-eye-purple">{card.name_kr}</p>
                <p className="text-12 text-text-light mt-0.5 whitespace-nowrap">
                  {dc.label} · {dc.direction === "upright" ? "정방향" : "역방향"}
                </p>
              </div>
            </div>
          )}
          {(content && <EmphasisText text={content} />) || (
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
