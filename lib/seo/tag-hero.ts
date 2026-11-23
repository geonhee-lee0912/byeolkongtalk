// lib/seo/tag-hero.ts — 태그 랜딩 히어로 이미지 매핑.
// 신규 4종은 4:3 배경 포함 WebP, 나머지 6종은 기존 정사각 투명 PNG 재활용.
// 낮은 배너에 그림을 자르지 않고 넣는다(디자인 다듬기 묶음 9 테마 첫 그림 A, 운영자 11-22) — 남는 좌우는 bg 로 잇는다.
// alt 는 두지 않는다 — 히어로는 장식이고 주제·정보는 h1 과 intro 가 전달한다(JSX 에서 alt="").
export interface TagHero {
  src: string;
  /** 배경이 구워진 그림만: 배너 좌우를 채우는 색. 없으면 투명 캐릭터 컷(연보라 바탕) */
  bg?: string;
}

/**
 * 그림 양끝에서 위→아래 2% 간격으로 뽑은 51색. 그림을 바꾸면 색도 다시 뽑는다
 * (더 성기게 뽑으면 새 인연의 지평선이 배너 좌우에서 끊긴다).
 */
function edgeFill(colors: string): string {
  const stops = colors.split(" ").map((c, i) => `#${c} ${i * 2}%`);
  // design-allow: 그림에 구워진 바탕을 좌우로 잇는 색(장식 그라데이션 아님)
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}

export const TAG_HERO: Record<string, TagHero> = {
  reunion: {
    src: "/guide-hero-reunion.webp",
    bg: edgeFill("e6def4 e6def3 e6ddf2 e6def2 e6def2 e6def2 e6ddf4 e6def2 e6def2 e5ddf2 e6dcf2 e5ddf3 e5ddf2 e6ddf1 e7dbf2 e7dcf3 e6dcf4 e6dbf3 e6daf2 e5daf2 e4d8f2 e4d7f0 e3d6ee e1d5ee e1d5ee e0d4ec e0d3ec ddd3eb dcd0ea dcd0ea dccee8 dacee9 d9cee7 d9cce7 d8cbe6 d7cae6 d4cae4 d6c8e2 d4c6e2 d4c7e3 d3c7e2 d2c6e2 d0c4e2 d2c5e0 cfc4e1 cec4e0 cec3e2 cec2e3 cec2e3 cdc2df ccc1de"),
  },
  "relationship-cooling": {
    src: "/guide-hero-relationship-cooling.webp",
    bg: edgeFill("ccc2e6 ccc2e6 ccc2e5 cbc1e5 ccc2e4 ccc2e6 ccc2e4 cbc2e4 ccc2e4 cdc2e4 cdc1e6 cdc1e6 cdc1e6 cdc2e4 cec4e6 cfc5e6 d0c6e6 d0c6e8 d1c7e8 d4caeb d4caeb d7caea d9cdec dbceec ded0ed dfd1ee dfd1ed e0d3ee e2d2ee e2d5ee e3d6f0 e5d8f1 e6d9f2 e7daf3 e8dbf4 e9dcf5 ebddf6 ecdef7 ecdff6 ece1f8 ece2f8 ece2f8 eee2f7 efe3f7 efe3f7 efe3f7 efe3f7 f1e4f8 f2e5f9 f2e5f9 f0e5f9"),
  },
  "new-love": {
    src: "/guide-hero-new-love.webp",
    bg: edgeFill("ccbde0 ccbde0 ccbdde ccbedf cebfe0 cebfe0 cfc1e2 d0c1e2 d0c4e3 d2c4e2 d2c5e2 d4c7e2 d6c9e3 d8cbe4 d9cce5 dacee3 dcd0e4 ded2e4 e1d2e4 e2d4e6 e4d8e4 e6dbe4 e7dde5 e8dee6 e9e0e3 ece4e4 eee4e4 f0e8e4 f2eae4 f4eae2 f6ece3 f6efe4 f6f0e2 f9f2e3 fbf4e4 fcf6e4 fcf6e4 ede3e9 eae0e7 e7dce7 e4d8e5 e0d3e4 ded0e5 dacde4 d7cae3 d2c5e0 d1c3e1 cebfdf ccbee0 cbbadf cbbcde"),
  },
  "work-people": {
    src: "/guide-hero-work-people.webp",
    bg: edgeFill("d2c4e7 d2c4e6 d1c4e6 d2c4e6 d2c4e6 d2c5e9 d1c6e9 d2c5e9 d3c6e8 d3c8e8 d4c8ea d5c8e9 d6c8eb d6caec d6caed d8cbed dacaed dacced dbcded dbcded deceef decff0 ded0f0 dfd1f1 e0d2f0 e1d3f1 e2d3f1 e2d4f0 e4d4f0 e4d4f0 e4d6f2 e6d6f3 e6d9f4 e6d9f4 e6d8f4 e8dbf4 e8dcf4 eaddf6 ebddf6 eadef7 ece0f8 ede0f9 ede0f8 ede1fa eee1fa eee2fa efe2f9 f0e4fa f0e4fa f2e5fb f2e5fb"),
  },
  "his-mind": { src: "/byeolkong-curious.png" },
  "contact-timing": { src: "/byeolkong-focus.png" },
  some: { src: "/byeolkong-joy.png" },
  choice: { src: "/byeolkong-tarot.png" },
  career: { src: "/byeolkong-saju.png" },
  "free-talk": { src: "/byeolkong-listen.png" },
};
