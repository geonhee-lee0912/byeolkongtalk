"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import cardContent from "@/data/seo/card-content.json";
import {
  getAllTarotCards,
  getCardImagePath,
  CARD_BACK_IMAGE,
  type TarotCard,
} from "@/lib/tarot/cards";
import { buildCardSlug } from "@/lib/seo/tarot-slugs";

interface Drawn {
  card: TarotCard;
  reversed: boolean;
}
const CONTENT = cardContent as Record<string, { oneLiner?: string }>;

export default function DailyCardDraw() {
  const [drawn, setDrawn] = useState<Drawn | null>(null);

  const draw = () => {
    const cards = getAllTarotCards();
    setDrawn({
      card: cards[Math.floor(Math.random() * cards.length)],
      reversed: Math.random() < 0.3,
    });
  };

  const slug = drawn ? buildCardSlug(drawn.card) : null;
  const keywords = drawn
    ? drawn.reversed
      ? drawn.card.reversed
      : drawn.card.upright
    : [];
  const oneLiner = slug ? CONTENT[slug]?.oneLiner : undefined;

  return (
    <div className="text-center">
      <div className="relative w-[150px] h-[255px] mx-auto rounded-xl overflow-hidden shadow-md">
        <Image
          src={drawn ? getCardImagePath(drawn.card.id) : CARD_BACK_IMAGE}
          alt={drawn ? `${drawn.card.name_kr} 타로 카드` : "타로 카드 뒷면"}
          fill
          sizes="150px"
          className={`object-cover ${drawn?.reversed ? "rotate-180" : ""}`}
        />
      </div>

      {drawn ? (
        <div className="mt-4">
          <p className="text-[16px] font-bold text-eye-purple">
            {drawn.card.name_kr} {drawn.reversed ? "(역방향)" : "(정방향)"}
          </p>
          <p className="text-[13px] text-eye-purple/90 leading-relaxed mt-2">
            {oneLiner ?? `오늘 너에게 온 결 — ${keywords.join(", ")}`}
          </p>
          {slug && CONTENT[slug] && (
            <Link
              href={`/guide/tarot-cards/${slug}`}
              className="inline-block mt-2 text-[12px] font-bold text-lilac-deep"
            >
              이 카드 의미 자세히 보기 ›
            </Link>
          )}
          <button
            type="button"
            onClick={draw}
            className="block mx-auto mt-3 text-[12px] text-text-light underline"
          >
            다시 뽑기
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={draw}
          className="mt-5 w-full py-3.5 rounded-xl bg-lilac-deep text-white font-bold text-[15px] hover:bg-lilac-deep/90 active:scale-[0.98] transition"
        >
          오늘의 카드 뽑기 (무료 · 가입 없음)
        </button>
      )}
    </div>
  );
}
