// 결과 화면 크로스셀 카드 선정 — 순수 로직 (ResultUpsell 에서 분리, 테스트 대상).
// 크로스셀 규칙(정적, 개인화 없음):
//   상담 결과(variant="counsel") → 궁합 분석 + 오늘의 운세(무료 리텐션 훅)
//   운세 결과(variant=FortuneType) → 상담 진입 1개 + 같은 base 의 다음 운세 1개

import {
  FORTUNE_CONFIG,
  FORTUNE_LIST,
  FORTUNE_GRADIENTS,
  type FortuneType,
  type FortuneConfig,
} from "@/lib/fortune/types";
import type { SpreadCategory } from "@/lib/tarot/spreads";

// 타로 주제(SpreadCategory) → 톤 맞춘 사주 목적지(20~40★, 조사 결). 위로/재미/평생 금지.
const SAJU_BY_CATEGORY: Record<SpreadCategory, FortuneType> = {
  love: "love_self", // 연애 고민 → 내 연애 사주(1인·뿌리·패턴)
  interpersonal: "compat_social", // 사람 관계 → 인간관계 궁합
  career: "career_timing", // 진로 → 취업·이직 타이밍
  decision: "talent_path", // 선택 → 재능·적성(방향)
  mental: "nature_self", // 마음 → 타고난 나(자기이해)
  worry: "love_self",
  default: "love_self",
};

// 사주/운세 결과 → 주제 연관 다음 사주(랜덤-next 대신). 위로/재미 미스매치 방지.
const RELATED_SAJU: Partial<Record<FortuneType, FortuneType[]>> = {
  love_self: ["love_year", "marriage"],
  love_year: ["love_self", "marriage"],
  marriage: ["love_self", "love_year"],
  nature_self: ["talent_path", "user_manual"],
  talent_path: ["career_timing", "nature_self"],
  user_manual: ["nature_self", "love_self"],
  element_balance: ["nature_self", "wealth_vessel"],
  wealth_vessel: ["wealth_year", "career_timing"],
  wealth_year: ["wealth_vessel", "career_timing"],
  career_timing: ["talent_path", "wealth_year"],
  monthly: ["wealth_year", "love_year"],
  saju_full: ["life_full", "monthly"],
  life_full: ["saju_full", "life_graph"],
  compat: ["love_self", "compat_social"],
  compat_social: ["user_manual", "compat"],
  good_days: ["monthly", "wealth_year"],
  fact_bomb: ["past_life", "saju_report_card"],
  past_life: ["fact_bomb", "life_graph"],
  saju_report_card: ["fact_bomb", "life_full"],
  life_graph: ["life_full", "saju_full"],
  daily: ["love_self", "monthly"],
};

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

/** 종목이 진열(active)돼 렌더 가능한지 — undefined.href 크래시(2026-07-30 prod) 방지. */
function pickValid(types: FortuneType[] | undefined): FortuneConfig | null {
  for (const t of types ?? []) {
    const f = FORTUNE_CONFIG[t];
    if (f && f.active) return f;
  }
  return null;
}

export function crossCards(
  variant: "counsel" | FortuneType,
  topic?: SpreadCategory
): CrossCard[] {
  if (variant === "counsel") {
    // 타로톡 유저는 대개 불안·고민 상태 → 위로/정체성/재미 금지, "같은 고민을 더 파는" 결로.
    // 주제(SpreadCategory) 맞춤 사주(조사 톤·1인) + 오늘의 운세(리텐션).
    // (또 뽑기·대화 심화는 RechargeBlock 이 이미 프라이머리로 처리)
    const sajuType = SAJU_BY_CATEGORY[topic ?? "default"] ?? "love_self";
    const saju = pickValid([sajuType, "love_self"]) ?? FORTUNE_CONFIG.love_self;
    return [saju, FORTUNE_CONFIG.daily].map(cardFromFortune);
  }
  const cfg = FORTUNE_CONFIG[variant];
  // 주제 연관 다음 사주 우선(RELATED_SAJU). 무료 출발이면 60★+ 콜드 페이월 제외.
  const relatedRaw = pickValid(RELATED_SAJU[variant]);
  const related =
    relatedRaw && !(cfg.cost === 0 && relatedRaw.cost > 40) ? relatedRaw : null;
  // 폴백: 같은 base 다음 진열 상품 (레거시 안전판)
  const sameBase = FORTUNE_LIST.filter(
    (f) => f.base === cfg.base && !(cfg.cost === 0 && f.cost > 40)
  );
  const idx = sameBase.findIndex((f) => f.type === cfg.type);
  const next =
    related ??
    (sameBase.length > 0 ? sameBase[(idx + 1) % sameBase.length] : FORTUNE_CONFIG.daily);
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
