// lib/seo/tag-hero.ts — 태그 랜딩 히어로 이미지 매핑.
// 신규 4종은 4:3 배경 포함 WebP, 나머지 6종은 기존 정사각 투명 PNG 재활용.
// alt 는 두지 않는다 — 히어로는 장식이고 주제·정보는 h1 과 intro 가 전달한다(JSX 에서 alt="").
export interface TagHero {
  src: string;
  /** 이미지에 배경이 구워져 있으면 true(cover). 투명 캐릭터 컷은 false(contain + CSS 그라데이션) */
  hasBackground: boolean;
}

export const TAG_HERO: Record<string, TagHero> = {
  reunion: { src: "/guide-hero-reunion.webp", hasBackground: true },
  "relationship-cooling": {
    src: "/guide-hero-relationship-cooling.webp",
    hasBackground: true,
  },
  "new-love": { src: "/guide-hero-new-love.webp", hasBackground: true },
  "work-people": { src: "/guide-hero-work-people.webp", hasBackground: true },
  "his-mind": { src: "/byeolkong-curious.png", hasBackground: false },
  "contact-timing": { src: "/byeolkong-focus.png", hasBackground: false },
  some: { src: "/byeolkong-joy.png", hasBackground: false },
  choice: { src: "/byeolkong-tarot.png", hasBackground: false },
  career: { src: "/byeolkong-saju.png", hasBackground: false },
  "free-talk": { src: "/byeolkong-listen.png", hasBackground: false },
};
