"use client";

// 결과 화면 하단 공용 업셀 — 첫 충전 +50% 배너(자격자만) + 크로스셀 카드 2장.
// 크로스셀 규칙(정적, 개인화 없음):
//   상담 결과(variant="counsel") → 오늘의 운세 + 이번달
//   운세 결과(variant=FortuneType) → 상담 진입 1개 + 같은 base 의 다음 운세 1개

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FORTUNE_CONFIG,
  FORTUNE_LIST,
  FORTUNE_GRADIENTS,
  type FortuneType,
  type FortuneConfig,
} from "@/lib/fortune/types";

interface CrossCard {
  href: string;
  emoji: string;
  label: string;
  tagline: string;
  badge: string;
  gradient: string;
}

function cardFromFortune(f: FortuneConfig): CrossCard {
  return {
    href: f.href,
    emoji: f.emoji,
    label: f.label,
    tagline: f.tagline,
    badge: f.cost === 0 ? "무료" : `⭐ ${f.cost}`,
    gradient: FORTUNE_GRADIENTS[f.type],
  };
}

function crossCards(variant: "counsel" | FortuneType): CrossCard[] {
  if (variant === "counsel") {
    return [FORTUNE_CONFIG.daily, FORTUNE_CONFIG.monthly].map(cardFromFortune);
  }
  const cfg = FORTUNE_CONFIG[variant];
  const sameBase = FORTUNE_LIST.filter((f) => f.base === cfg.base);
  const idx = sameBase.findIndex((f) => f.type === cfg.type);
  const next = sameBase[(idx + 1) % sameBase.length];
  return [
    {
      href: "/",
      emoji: "💬",
      label: "별콩이랑 고민 상담",
      tagline: "리포트 말고 대화로 깊게 나누고 싶다면",
      badge: "상담",
      gradient: "linear-gradient(135deg, #EFEAF6 0%, #DACFEC 100%)",
    },
    cardFromFortune(next),
  ];
}

export default function ResultUpsell({
  variant,
  showBonus = true,
}: {
  variant: "counsel" | FortuneType;
  /** 첫충전 +50% 배너 노출 여부. 결과 화면이 RechargeBlock 에서 이미 보여주면 false. */
  showBonus?: boolean;
}) {
  const [firstChargeEligible, setFirstChargeEligible] = useState(false);

  useEffect(() => {
    if (!showBonus) return;
    void fetch("/api/stars/first-charge-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFirstChargeEligible(d?.eligible === true))
      .catch(() => {});
  }, [showBonus]);

  const cards = crossCards(variant);

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
              첫 충전하면 별 +50% 보너스
            </p>
            <p className="text-[11.5px] text-eye-purple/70 mt-0.5">
              처음 딱 한 번, 어떤 패키지든 절반을 더 얹어줘
            </p>
          </div>
          <span className="text-eye-purple/60 text-[16px]">›</span>
        </Link>
      )}

      <p className="text-[13px] font-bold text-eye-purple px-1 mt-1">
        이런 것도 있어 ✨
      </p>
      {cards.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          className="flex items-center gap-3.5 p-4 bg-white/90 rounded-2xl border border-lilac-soft hover:border-lilac-deep/40 transition"
        >
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-[22px] shrink-0"
            style={{ background: c.gradient }}
          >
            {c.emoji}
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
            <p className="text-[12px] text-text-light mt-0.5 leading-snug line-clamp-1">
              {c.tagline}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
