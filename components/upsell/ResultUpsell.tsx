"use client";

// 결과 화면 하단 공용 업셀 — 첫 충전 +20% 배너(자격자만) + 크로스셀 카드 2장.
// 카드 선정 규칙은 ./cross-cards.ts (순수 로직, 테스트 포함)

import { useEffect, useState } from "react";
import Link from "next/link";
import { type FortuneType } from "@/lib/fortune/types";
import { FortuneIcon } from "@/components/fortune/FortuneIcon";
import { crossCards } from "./cross-cards";
import type { SpreadCategory } from "@/lib/tarot/spreads";
import { trackUiEvent } from "@/lib/analytics/ui-events";

export default function ResultUpsell({
  variant,
  showBonus = true,
  topic,
}: {
  variant: "counsel" | FortuneType;
  /** 첫충전 +20% 배너 노출 여부. 결과 화면이 RechargeBlock 에서 이미 보여주면 false. */
  showBonus?: boolean;
  /** 타로 주제(counsel 일 때) — 주제 맞춤 사주 크로스셀용. */
  topic?: SpreadCategory;
}) {
  const [firstChargeEligible, setFirstChargeEligible] = useState(false);

  useEffect(() => {
    if (!showBonus) return;
    void fetch("/api/stars/first-charge-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFirstChargeEligible(d?.eligible === true))
      .catch(() => {});
  }, [showBonus]);

  const cards = crossCards(variant, topic);

  return (
    <div className="w-full max-w-md mx-auto px-5 mt-8 flex flex-col gap-3">
      {showBonus && firstChargeEligible && (
        <Link
          href="/shop"
          className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-gold-soft/60 to-gold/40 border border-gold/50"
        >
          <span className="text-[22px]">🎁</span>
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-extrabold text-eye-purple">
              첫 충전하면 별 +20% 보너스
            </p>
            <p className="text-[11.5px] text-eye-purple/70 mt-0.5">
              처음 딱 한 번, 어떤 패키지든 절반을 더 얹어줘
            </p>
          </div>
          <span className="text-eye-purple/60 text-[16px]">›</span>
        </Link>
      )}

      <p className="text-[13px] font-bold text-eye-purple px-1 mt-1">
        {variant === "counsel" ? "이 고민, 사주로 뿌리부터 볼래?" : "이런 것도 있어 ✨"}
      </p>
      {cards.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          onClick={() => trackUiEvent("result_cta_clicked", { meta: { cta: "cross_sell", product: c.href } })}
          className="flex items-center gap-3.5 p-4 bg-white/90 rounded-2xl border border-lilac-soft hover:border-lilac-deep/40 transition"
        >
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-[22px] shrink-0"
            style={{ background: c.gradient }}
          >
            {c.fortuneType ? (
              <FortuneIcon type={c.fortuneType} size={36} />
            ) : (
              c.emoji
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] font-bold text-eye-purple">
                {c.label}
              </span>
              <span className="text-[10px] font-bold text-lilac-deep bg-lilac-soft/60 px-1.5 py-0.5 rounded-full">
                {c.badge}
              </span>
            </div>
            <p className="text-[12px] text-text-light mt-0.5 leading-snug line-clamp-2">
              {c.tagline}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
