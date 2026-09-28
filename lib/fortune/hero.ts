import type { FortuneType } from "./types";

// 리포트 종류 → 결과 화면 히어로(투명 컷아웃 webp). 없는 종목은 기본 별콩이(byeolkong-joy).
//
// 🔴 2026-09-28 **종목별 전용화** — 이전엔 연애 3종·자기이해 3종·재물 2종·궁합 2종이 한 장을
// 돌려썼다. 상품 설명 페이지를 훑을 때 같은 그림이 연달아 나오는 게 드러나 20컷을 새로 뽑았다.
// 컷아웃은 상품 카드(fortuneCardSrc)와 **같은 소품·같은 표정**이라 랜딩→결과가 이어진다.
// ⚠️ `-love/-self/-wealth/-career.webp` 는 이제 참조 0 이지만 지우지 않는다(과거 공유 카드 캐시).
const HERO: Partial<Record<FortuneType, string>> = {
  life_full: "/fortune-hero-life_full.webp",
  fact_bomb: "/fortune-hero-fact_bomb.webp",
  past_life: "/fortune-hero-past_life.webp",
  saju_full: "/fortune-hero-saju_full.webp",
  compat: "/fortune-hero-compat.webp",
  compat_social: "/fortune-hero-compat_social.webp",
  love_self: "/fortune-hero-love_self.webp",
  love_year: "/fortune-hero-love_year.webp",
  marriage: "/fortune-hero-marriage.webp",
  wealth_vessel: "/fortune-hero-wealth_vessel.webp",
  wealth_year: "/fortune-hero-wealth_year.webp",
  nature_self: "/fortune-hero-nature_self.webp",
  talent_path: "/fortune-hero-talent_path.webp",
  user_manual: "/fortune-hero-user_manual.webp",
  career_timing: "/fortune-hero-career_timing.webp",
  element_balance: "/fortune-hero-element_balance.webp",
  saju_report_card: "/fortune-hero-saju_report_card.webp",
  life_graph: "/fortune-hero-life_graph.webp",
  good_days: "/fortune-hero-good_days.webp",
  daily: "/fortune-hero-daily.webp",
  monthly: "/fortune-hero-monthly.webp",
  // 타로 5종 — 기존 별콩이 타로 일러스트 재사용(신규 생성 없음)
  tarot_daily: "/byeolkong-tarot.png",
  tarot_love: "/byeolkong-tarot.png",
  tarot_money: "/byeolkong-tarot.png",
  tarot_career: "/byeolkong-tarot.png",
  tarot_relation: "/byeolkong-tarot.png",
};

/** 종목별 플래그십 히어로 경로(없으면 null → 기본 별콩이 사용). */
export function fortuneHeroSrc(type: FortuneType | null | undefined): string | null {
  return type ? (HERO[type] ?? null) : null;
}

// 상품 설명 페이지의 카드 배너(full-bleed 4:3). 홈 캐러셀과 같은 언어라 파일도 같은 규격(896×672).
// 결과 화면 컷아웃(HERO)과 짝이며 소품·표정이 일치한다.
const CARD_KEYS = new Set([
  "compat", "compat_social", "love_self", "love_year", "marriage",
  "nature_self", "talent_path", "user_manual", "element_balance", "life_full",
  "wealth_vessel", "wealth_year", "career_timing",
  "fact_bomb", "past_life", "saju_report_card", "life_graph",
  "saju_full", "monthly", "saju_mbti",
]);

/** 상품 카드 배너 경로. 카드가 없는 종목(비활성·타로)은 null. */
export function fortuneCardSrc(key: string | null | undefined): string | null {
  return key && CARD_KEYS.has(key) ? `/fortune/card/${key}.webp` : null;
}
