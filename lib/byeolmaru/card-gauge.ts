// lib/byeolmaru/card-gauge.ts — 오늘 타로 게이지: 오늘 사주 축(회색 바탕) + 이 카드의 보정(금색 덧칠).
// 🔴 룰 100% · LLM 0 · 원가 0. 스펙 2026-09-19 §6-3.
// 축 점수는 card-narrative 라우트가 이미 계산하는 axisScores(오늘 일진 × 내 사주)다 — 그대로 쓰면
// 오늘 사주 화면과 똑같은 막대가 두 번 나오므로 카드가 더한 만큼만 덧칠한다.
// 🔴 보정 폭은 ±15 이내로 작게 — 그보다 크면 "카드가 하루를 뒤집는다"가 되어 단정적 예언 쪽으로 기운다.
import type { TarotCard } from "@/lib/tarot/cards";
import type { AxisScores } from "./day-score.ts";

export type CardDomain = "love" | "money" | "work" | "all";

/** 보정 절대 상한. 아래 상수들이 이 값을 넘지 않는지 테스트가 지킨다. */
export const MAX_CARD_DELTA = 15;
/** 단일 도메인 카드(마이너 · 도메인 태그된 메이저)가 그 축에 더하는 폭. */
const DOMAIN_DELTA = 12;
/** 전체(all) 메이저가 세 축에 고루 더하는 폭 — 한 축에 몰지 않으니 작게. */
const ALL_DELTA = 6;

/** 마이너 슈트(한글 suit_kr) → 도메인. lib/tarot/cards.ts 가 suit 를 suit_kr("완드"/"컵"/"소드"/"펜타클")로 넣는다. */
const SUIT_DOMAIN: Record<string, CardDomain> = {
  컵: "love",
  펜타클: "money",
  완드: "work",
  소드: "work",
};

/** 메이저 아르카나 22장 도메인 태그(스펙 §9-4 — suit 가 없어 카드별로 정한다). 튜닝 대상.
 *  기준: 관계·감정이 주제면 love, 의지·성취·판단이 주제면 work, 그 외 인생 전반은 all. 돈 전용 메이저는 없다(펜타클이 맡는다). */
const MAJOR_DOMAIN: Record<number, CardDomain> = {
  0: "all", // 바보
  1: "work", // 마법사
  2: "all", // 여교황
  3: "love", // 여황제
  4: "work", // 황제
  5: "all", // 교황
  6: "love", // 연인
  7: "work", // 전차
  8: "all", // 힘
  9: "all", // 은둔자
  10: "all", // 운명의 수레바퀴
  11: "work", // 정의
  12: "all", // 매달린 사람
  13: "all", // 죽음
  14: "all", // 절제
  15: "love", // 악마
  16: "all", // 탑
  17: "love", // 별
  18: "all", // 달
  19: "all", // 태양
  20: "work", // 심판
  21: "all", // 세계
};

export function cardDomain(card: TarotCard): CardDomain {
  if (card.suit) return SUIT_DOMAIN[card.suit] ?? "all";
  return MAJOR_DOMAIN[card.id] ?? "all";
}

export interface GaugeAxis {
  /** 오늘 사주 축(axisScores) — 오늘 사주 화면과 항상 같은 값. */
  base: number;
  /** 이 카드가 더한(정위 +)/뺀(역위 −) 폭. 0 이면 이 축엔 손대지 않은 카드. */
  delta: number;
}
export interface CardGauge {
  love: GaugeAxis;
  money: GaugeAxis;
  work: GaugeAxis;
}

/** 오늘 사주 축 + 카드 → 게이지. 정위 +, 역위 −. */
export function cardGauge(axes: AxisScores, card: TarotCard, reversed: boolean): CardGauge {
  const domain = cardDomain(card);
  const sign = reversed ? -1 : 1;
  const deltaFor = (k: "love" | "money" | "work"): number =>
    domain === "all" ? sign * ALL_DELTA : domain === k ? sign * DOMAIN_DELTA : 0;
  return {
    love: { base: axes.love, delta: deltaFor("love") },
    money: { base: axes.money, delta: deltaFor("money") },
    work: { base: axes.work, delta: deltaFor("work") },
  };
}

/** 화면 최종값(0~100). */
export function gaugeFinal(a: GaugeAxis): number {
  return Math.max(0, Math.min(100, Math.round(a.base + a.delta)));
}
