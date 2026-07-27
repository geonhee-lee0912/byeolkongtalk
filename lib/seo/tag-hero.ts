// lib/seo/tag-hero.ts — 태그 랜딩 히어로 이미지 매핑.
// 신규 4종은 4:3 배경 포함 WebP, 나머지 6종은 기존 정사각 투명 PNG 재활용.
export interface TagHero {
  src: string;
  alt: string;
  /** 이미지에 배경이 구워져 있으면 true(cover). 투명 캐릭터 컷은 false(contain + CSS 그라데이션) */
  hasBackground: boolean;
}

export const TAG_HERO: Record<string, TagHero> = {
  reunion: {
    src: "/guide-hero-reunion.webp",
    alt: "빛나는 금색 별 하나를 앞발에 든 별콩이가 고개를 돌려 뒤를 바라보는 그림",
    hasBackground: true,
  },
  "relationship-cooling": {
    src: "/guide-hero-relationship-cooling.webp",
    alt: "빛이 꺼진 회색 별과 환하게 빛나는 금색 별 사이에 앉아 턱에 앞발을 대고 생각에 잠긴 별콩이 그림",
    hasBackground: true,
  },
  "new-love": {
    src: "/guide-hero-new-love.webp",
    alt: "앞발을 이마에 얹고 지평선 너머 새로 떠오르는 별 하나를 바라보는 별콩이 그림",
    hasBackground: true,
  },
  "work-people": {
    src: "/guide-hero-work-people.webp",
    alt: "크고 작은 별이 여럿 모인 무리 옆에서 앞발을 모으고 조심스럽게 서 있는 별콩이 그림",
    hasBackground: true,
  },
  "his-mind": {
    src: "/byeolkong-curious.png",
    alt: "머리 옆에 금색 물음표를 띄운 채 앞발을 턱에 대고 궁금해하는 별콩이 그림",
    hasBackground: false,
  },
  "contact-timing": {
    src: "/byeolkong-focus.png",
    alt: "두 앞발로 반짝이는 수정 구슬을 감싸 들고 안을 들여다보는 별콩이 그림",
    hasBackground: false,
  },
  some: {
    src: "/byeolkong-joy.png",
    alt: "두 앞발을 번쩍 들고 눈을 감은 채 환하게 웃으며 뛰어오르는 별콩이 그림",
    hasBackground: false,
  },
  choice: {
    src: "/byeolkong-tarot.png",
    alt: "뒷면이 보이는 타로 카드 세 장을 부채처럼 펼쳐 든 별콩이 그림",
    hasBackground: false,
  },
  career: {
    src: "/byeolkong-saju.png",
    alt: "금색 글씨가 적힌 오래된 두루마리를 양 앞발로 펼쳐 읽는 별콩이 그림",
    hasBackground: false,
  },
  "free-talk": {
    src: "/byeolkong-listen.png",
    alt: "앞발을 가슴 앞에 모으고 조용히 미소 지으며 이야기를 들어주는 별콩이 그림",
    hasBackground: false,
  },
};
