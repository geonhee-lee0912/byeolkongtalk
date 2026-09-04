// lib/byeolmaru/crosssell.ts — 별마루 하단 자사 크로스셀 추천(룰, 오늘 축 기반). 3rd-party 광고 아님.
import type { DayCell } from "./calendar.ts";

export type CrossSell = { product: "saju_report" | "tarot"; title: string; desc: string; href: string };

const TAROT: CrossSell = {
  product: "tarot", href: "/",
  title: "오늘 이 흐름, 타로로 더 깊게",
  desc: "마음이 복잡한 하루엔 카드 한 장이 방향을 잡아줘.",
};
const SAJU: CrossSell = {
  product: "saju_report", href: "/fortune",
  title: "네 사주로 더 길게 보기",
  desc: "오늘 하루 너머, 이번 달·올해 흐름까지 풀어줄게.",
};

/** 연애 축이 최고인 날 → 타로(연애 결), 그 외 → 사주 리포트. 동점은 사주로. */
export function pickCrossSell(cell: DayCell): CrossSell {
  const { love, money, work } = cell.axes;
  return love > money && love > work ? TAROT : SAJU;
}
