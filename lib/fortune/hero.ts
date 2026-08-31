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
};

/** 종목별 플래그십 히어로 경로(없으면 null → 기본 별콩이 사용). */
export function fortuneHeroSrc(type: FortuneType | null | undefined): string | null {
  return type ? (HERO[type] ?? null) : null;
}
