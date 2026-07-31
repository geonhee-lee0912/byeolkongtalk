// 결과 화면 크로스셀 카드 선정 — 순수 로직 (ResultUpsell 에서 분리, 테스트 대상).
// 크로스셀 규칙(정적, 개인화 없음):
//   상담 결과(variant="counsel") → 오늘의 운세 + 이번달
//   운세 결과(variant=FortuneType) → 상담 진입 1개 + 같은 base 의 다음 운세 1개

import {
  FORTUNE_CONFIG,
  FORTUNE_LIST,
  FORTUNE_GRADIENTS,
  type FortuneType,
  type FortuneConfig,
} from "@/lib/fortune/types";

export interface CrossCard {
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

export function crossCards(variant: "counsel" | FortuneType): CrossCard[] {
  if (variant === "counsel") {
    return [FORTUNE_CONFIG.daily, FORTUNE_CONFIG.monthly].map(cardFromFortune);
  }
  const cfg = FORTUNE_CONFIG[variant];
  const sameBase = FORTUNE_LIST.filter((f) => f.base === cfg.base);
  const idx = sameBase.findIndex((f) => f.type === cfg.type);
  // 진열대 재편으로 같은 base 상품이 FORTUNE_LIST 에 하나도 없을 수 있다
  // (예: W1 재편으로 빠진 레거시 타로 리포트) — 오늘의 운세로 폴백.
  // 2026-07-30 prod: sameBase=[] 에서 undefined.href 크래시로 결과 화면 전체가 죽었다.
  const next =
    sameBase.length > 0
      ? sameBase[(idx + 1) % sameBase.length]
      : FORTUNE_CONFIG.daily;
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
