"use client";

import Image from "next/image";
import type { TarotReport } from "@/lib/fortune/tarot-report";
import { getCardImagePath } from "@/lib/tarot/cards";
import type { DrawnCard } from "@/lib/tarot/spreads";

export default function TarotReportView({
  report,
  drawnCards,
  accent = "#7c5cff",
}: {
  report: TarotReport;
  drawnCards: DrawnCard[];
  accent?: string;
}) {
  return (
    <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-5 animate-fade-in">
      <h1 className="text-[20px] font-bold text-eye-purple text-center leading-snug">
        {report.headline}
      </h1>

      <div className="flex flex-col gap-4">
        {report.cards.map((card, i) => {
          const drawn = drawnCards[i];
          return (
            <div
              key={i}
              className="bg-cream-warm rounded-2xl p-4 border border-lilac-mid/30"
            >
              <div className="flex gap-3">
                {drawn && (
                  <div className="shrink-0">
                    <Image
                      src={getCardImagePath(drawn.card_id)}
                      alt={card.cardName}
                      width={64}
                      height={99}
                      className={`rounded-lg ${
                        card.direction === "reversed" ? "rotate-180" : ""
                      }`}
                      style={{ objectFit: "cover" }}
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-text-light/70">
                    {card.position}
                  </div>
                  <div className="text-[14px] font-bold text-eye-purple">
                    {card.cardName}
                    <span className="ml-1.5 text-[11px] font-normal text-text-light/70">
                      {card.direction === "upright" ? "정방향" : "역방향"}
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-[13px] text-text-light leading-relaxed mt-3 whitespace-pre-wrap">
                {card.reading}
              </p>
            </div>
          );
        })}
      </div>

      <div className="bg-cream-warm rounded-2xl p-4 border border-lilac-mid/30">
        <div className="text-[12px] font-bold mb-1.5" style={{ color: accent }}>
          종합 해석
        </div>
        <p className="text-[13px] text-text-light leading-relaxed whitespace-pre-wrap">
          {report.summary}
        </p>
      </div>

      <div className="bg-gradient-to-br from-eye-purple via-lilac-deep to-eye-purple rounded-2xl p-4 shadow-lg shadow-lilac-deep/30">
        <div className="text-[12px] font-bold text-gold-soft mb-1.5">
          별콩이의 조언
        </div>
        <p className="text-[13px] text-white/90 leading-relaxed whitespace-pre-wrap">
          {report.advice}
        </p>
      </div>
    </div>
  );
}
