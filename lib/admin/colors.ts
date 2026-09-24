// lib/admin/colors.ts — 어드민 시각 어휘. 순수(스펙 §8 이 정본).
//
// 전부 night(#1F1735) 위에서 `dataviz` 검증기 6검사를 통과한 값이다 — 눈대중으로 바꾸지 말 것.
// 🔴 브랜드 골드는 **시리즈색이 아니다.** 강조·현재값 마커 전용이다.
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

/** 현재값 마커·강조 전용. 시리즈에 쓰지 않는다.
 *  🔴 `app/globals.css` 의 `@theme` 토큰을 참조한다 — 헥스를 복제하면 리브랜딩 때 갈린다.
 *  (`--color-gold` 는 그 파일이 이미 `var(--color-cream)` 등으로 직접 쓰는 실제 런타임
 *  CSS 변수라 여기서도 안전하게 참조 가능 — 코드 리뷰 Minor 1, 확인 후 반영.) */
export const GOLD = "var(--color-gold)";

/** 카테고리컬 8슬롯. 색은 **엔티티를 따르고 순위를 따르지 않는다** — 필터로 시리즈 수가
 *  바뀌어도 생존 항목의 색을 다시 칠하지 않는다(스펙 §8). */
export const CATEGORICAL = [
  "#3987e5", "#d95926", "#199e70", "#c98500",
  "#d55181", "#008300", "#9085e9", "#e66767",
] as const;
