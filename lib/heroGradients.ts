// 히어로 배너 그라데이션 팔레트 — 화면 패밀리별 고정.
// HOME(app/page.tsx)의 인디고 → 블루바이올렛 톤과는 명확히 구분되는 별도 팔레트.
// components/common/HeroBanner.tsx 의 gradient prop 에 그대로 전달.

/** 타로 패밀리(/tarot) — 짙은 보라 → 마젠타/로즈, 미스틱한 채도감 */
export const TAROT_HERO_GRADIENT =
  "linear-gradient(180deg, #2A1435 0%, #4A1D52 55%, #6B2B63 100%)";

/** 사주/운세 패밀리(/fortune) — 짙은 밤빛 → 따뜻한 자두빛, 골드 파티클과 어울리는 언더톤 */
export const FORTUNE_HERO_GRADIENT =
  "linear-gradient(180deg, #14101F 0%, #2E2238 55%, #5C3E42 100%)";
