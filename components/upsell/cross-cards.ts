// 결과 화면 크로스셀 카드 선정 — 순수 로직 (ResultUpsell 에서 분리, 테스트 대상).
// 크로스셀 규칙(정적, 개인화 없음):
//   상담 결과(variant="counsel") → 궁합 분석 + 별마루 오늘 사주(무료 리텐션 훅, 옛 daily 대체)
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
// 상품 설명 페이지의 "같이 보면 좋은 것" 도 이 표를 쓴다 — 인접성을 두 벌로 관리하면 갈라진다.
export const RELATED_SAJU: Partial<Record<FortuneType, FortuneType[]>> = {
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

// 옛 daily(무료 오늘의 운세) 리텐션 훅의 대체 — 무료 오늘 사주는 이제 별마루가 집이다.
// FortuneConfig 가 아니라 수동 CrossCard(별마루는 FortuneType 이 아님). 민트=무료 톤.
const BYEOLMARU_SAJU_CARD: CrossCard = {
  href: "/byeolmaru",
  emoji: "🗓", // iconSrc 가 있으면 안 쓰인다 — 아이콘 파일이 사라졌을 때의 폴백으로만 둔다
  iconSrc: "/icons/byeolmaru/hub.webp",
  // 라벨은 목적지와 맞춘다 — href 가 허브(/byeolmaru)인데 "오늘 사주"라고 부르면 한 칸 어긋난다
  // (오늘 사주 본문은 /byeolmaru/day 라 한 번 더 눌러야 나온다). 대신 잃는 구체성은 태그라인이
  // 메운다: 안에 뭐가 있는지 두 개를 직접 말한다.
  //
  // 이 **슬롯**은 결과 화면에서 제일 많이 눌리는 자리다 — 옛 daily 카드가 일평균 2.75클릭
  // (77클릭 / 09-01~09-28), 교체된 별마루 카드가 일평균 2.0(10클릭 / 09-28~10-02).
  // 같은 기간 love_self 50 · 다시뽑기 56. 그래서 "무료"라는 구체성을 흐리면 안 된다.
  // ⚠️ **정정(2026-10-02)**: 이 자리에 "별마루 카드 9월 55클릭"이라고 적었던 건 틀렸다 —
  //    그 숫자는 **옛 daily 카드**의 것이고 별마루 카드는 09-28에야 이 자리를 물려받았다.
  //    판단(구체성 유지)은 그대로지만, 근거는 "이 카드"가 아니라 "이 슬롯"이다.
  // 문구는 별마루가 스스로 붙인 칩과 일치한다 — 오늘 사주 "매일 무료" · 오늘 타로 "하루 1회 무료".
  // ⚠️ tagline 은 line-clamp-2 + 좌측 아이콘이라 2줄(≈24자) 안에 들어와야 한다.
  label: "별마루",
  tagline: "오늘 사주랑 오늘 타로, 매일 무료로 확인해봐",
  badge: "무료",
  // 🔴 FORTUNE_GRADIENTS.daily(금색)를 쓰면 안 된다 — 이 아이콘은 크림색 마루라 금색 타일
  //    위에서 대비가 사라져 형태가 뭉개진다(56px 실측). 홈 카드와 같은 라일락으로 맞춘다.
  gradient: "linear-gradient(135deg, #E8DEF5 0%, #D4C7EE 100%)",
};

export interface CrossCard {
  href: string;
  emoji: string;
  /** 사주 종목이면 그 타입 — ResultUpsell 이 이모지 대신 webp 아이콘을 렌더. 타로 상담 카드는 undefined. */
  fortuneType?: FortuneType;
  /** 사주 종목이 아닌 카드(타로 상담)의 전용 webp 경로. 있으면 이모지·fortuneType 보다 우선. */
  iconSrc?: string;
  label: string;
  tagline: string;
  badge: string;
  gradient: string;
}

function cardFromFortune(f: FortuneConfig): CrossCard {
  return {
    href: f.href,
    emoji: f.emoji,
    fortuneType: f.type,
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
    // 주제(SpreadCategory) 맞춤 사주(조사 톤·1인) + 별마루 오늘 사주(무료 리텐션, 옛 daily 대체).
    // (또 뽑기·대화 심화는 RechargeBlock 이 이미 프라이머리로 처리)
    const sajuType = SAJU_BY_CATEGORY[topic ?? "default"] ?? "love_self";
    const saju = pickValid([sajuType, "love_self"]) ?? FORTUNE_CONFIG.love_self;
    return [cardFromFortune(saju), BYEOLMARU_SAJU_CARD];
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
    (sameBase.length > 0 ? sameBase[(idx + 1) % sameBase.length] : FORTUNE_CONFIG.love_self);
  return [
    {
      href: "/",
      emoji: "🃏",
      iconSrc: "/icons/fortune/tarot_counsel.webp",
      label: "타로로 고민 상담",
      tagline: "리포트로 다 못 짚은 지금 이 고민, 타로 카드 뽑아 별콩이랑 바로 상담해봐",
      badge: "타로",
      gradient: "linear-gradient(135deg, #EFEAF6 0%, #DACFEC 100%)",
    },
    cardFromFortune(next),
  ];
}
