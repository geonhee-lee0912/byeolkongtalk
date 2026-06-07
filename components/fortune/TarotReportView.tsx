"use client";

import Image from "next/image";
import type { TarotReport } from "@/lib/fortune/tarot-report";
import { getCard, getCardImagePath } from "@/lib/tarot/cards";
import type { DrawnCard } from "@/lib/tarot/spreads";

/**
 * 카드 신원(이미지·이름·방향·포지션)은 서버 truth(drawnCards)에서,
 * 해석 글만 AI 출력에서 가져온다. 해석은 포지션 라벨로 매칭(없으면 인덱스 폴백)해
 * AI가 카드 순서를 바꿔도 이미지와 라벨이 어긋나지 않게 한다.
 */
function buildCardItems(report: TarotReport, drawnCards: DrawnCard[]) {
  if (drawnCards.length === 0) {
    // drawnCards 누락(레거시/공유 등) — AI 출력 그대로 폴백
    return report.cards.map((c, i) => ({
      key: i,
      cardId: null as number | null,
      position: c.position,
      cardName: c.cardName,
      direction: c.direction,
      reading: c.reading,
    }));
  }
  return drawnCards.map((drawn, i) => {
    const ai =
      report.cards.find((c) => c.position === drawn.label) ?? report.cards[i];
    return {
      key: i,
      cardId: drawn.card_id,
      position: drawn.label,
      cardName: getCard(drawn.card_id)?.name_kr ?? ai?.cardName ?? "",
      direction: drawn.direction,
      reading: ai?.reading ?? "",
    };
  });
}

export default function TarotReportView({
  report,
  drawnCards,
  accent = "#7c5cff",
}: {
  report: TarotReport;
  drawnCards: DrawnCard[];
  accent?: string;
}) {
  const items = buildCardItems(report, drawnCards);
  return (
    <div className="w-full max-w-md mx-auto px-5 flex flex-col gap-5 animate-fade-in">
      <h1 className="text-[20px] font-bold text-eye-purple text-center leading-snug">
        {report.headline}
      </h1>

      <div className="flex flex-col gap-4">
        {items.map((card) => (
          <div
            key={card.key}
            className="bg-cream-warm rounded-2xl p-4 border border-lilac-mid/30"
          >
            <div className="flex gap-3">
              {card.cardId !== null && (
                <div className="shrink-0">
                  <Image
                    src={getCardImagePath(card.cardId)}
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
        ))}
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
