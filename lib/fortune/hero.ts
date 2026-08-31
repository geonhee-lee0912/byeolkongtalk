import type { FortuneType } from "./types";

// 리포트 종류 → 플래그십 별콩이 히어로 일러스트(public/). 없는 종목은 기본 별콩이(byeolkong-joy).
// 일부는 테마 공유(연애/재물/자기이해). higgsfield 생성 → 투명 컷아웃(webp).
const HERO: Partial<Record<FortuneType, string>> = {
  life_full: "/fortune-hero-life_full.webp",
  fact_bomb: "/fortune-hero-fact_bomb.webp",
  past_life: "/fortune-hero-past_life.webp",
  saju_full: "/fortune-hero-saju_full.webp",
  compat: "/fortune-hero-compat.webp",
  compat_social: "/fortune-hero-compat.webp",
  love_self: "/fortune-hero-love.webp",
  love_year: "/fortune-hero-love.webp",
  marriage: "/fortune-hero-love.webp",
  wealth_vessel: "/fortune-hero-wealth.webp",
  wealth_year: "/fortune-hero-wealth.webp",
  nature_self: "/fortune-hero-self.webp",
  talent_path: "/fortune-hero-self.webp",
  user_manual: "/fortune-hero-self.webp",
  career_timing: "/fortune-hero-career.webp",
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
