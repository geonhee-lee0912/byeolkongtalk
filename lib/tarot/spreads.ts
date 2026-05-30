import type { EmotionTag } from "@/lib/emotions";

// ===== Spread Types =====

export type SpreadType =
  | "one_card"
  | "two_card"
  | "three_card"
  | "relationship_5";

export type SpreadCategory =
  | "love"
  | "interpersonal"
  | "career"
  | "decision"
  | "mental"
  | "worry"
  | "default";

export interface SpreadInfo {
  type: SpreadType;
  cardCount: number;
  starCost: number;
  label: string;
  tagline: string;
  description: string;
  accent: string; // hex color for the spread chip
}

export const SPREAD_INFO: Record<SpreadType, SpreadInfo> = {
  one_card: {
    type: "one_card",
    cardCount: 1,
    starCost: 10,
    label: "원카드",
    tagline: "한 장으로 가볍게",
    description: "빠르게 한 줄, 지금 고민에 대한 답이 필요할 때",
    accent: "#6B8DD6",
  },
  two_card: {
    type: "two_card",
    cardCount: 2,
    starCost: 15,
    label: "투카드",
    tagline: "두 장으로 균형있게",
    description: "너의 상황과 그에 대한 조언, 양쪽을 같이 봐줄게",
    accent: "#65B28F",
  },
  three_card: {
    type: "three_card",
    cardCount: 3,
    starCost: 22,
    label: "쓰리카드",
    tagline: "세 장으로 입체적으로",
    description: "너와 상대방 그리고 관계의 흐름까지 짚어서 더 깊이",
    accent: "#E0976B",
  },
  relationship_5: {
    type: "relationship_5",
    cardCount: 5,
    starCost: 35,
    label: "관계 스프레드",
    tagline: "다섯 장으로 두 사람을",
    description: "너와 상대방의 관계, 서로의 기대와 앞으로의 방향까지",
    accent: "#D4708F",
  },
};

// 고민 카테고리별 스프레드 설명 — 스프레드 선택 카드에 사용
export const SPREAD_DESCRIPTIONS: Record<
  SpreadType,
  Partial<Record<SpreadCategory, string>> & { default: string }
> = {
  one_card: {
    love: "지금 연애 고민, 한 장에 담긴 힌트로 답을 찾자",
    interpersonal: "지금 관계에 대한 실마리를 한 장에 담아줄게",
    career: "진로 고민, 한 줄 답이 필요할 때",
    decision: "지금 떠오르는 한 장이 답의 실마리가 돼",
    mental: "지친 마음에 필요한 한 장의 위로",
    worry: "돈 고민, 한 장으로 마음 방향부터 잡자",
    default: "빠르게 한 줄, 지금 고민에 대한 답이 필요할 때",
  },
  two_card: {
    love: "지금 연애 상황과 조언, 양쪽을 같이 봐줄게",
    interpersonal: "관계 상황과 풀어갈 실마리를 같이 봐줄게",
    career: "진로 상황과 조언, 지금 위치부터 확인해보자",
    decision: "찬반 두 장을 나란히 놓고 들여다보자",
    mental: "의식과 무의식, 마음 두 면을 같이 볼게",
    worry: "돈 상황과 조언, 두 장으로 방향을 짚어줄게",
    default: "너의 상황과 그에 대한 조언, 양쪽을 같이 봐줄게",
  },
  three_card: {
    love: "너와 상대 그리고 관계의 흐름까지 깊이 봐줄게",
    interpersonal: "너·상대·관계 흐름을 세 장으로 풀어줄게",
    career: "과거·현재·미래 흐름으로 진로를 비춰줄게",
    decision: "선택지 둘과 지금 상태를 같이 놓고 보자",
    mental: "마음·몸·영혼 세 층으로 너를 들여다볼게",
    worry: "상황·장애물·조언 순서로 걱정을 풀어줄게",
    default: "너와 상대방 그리고 관계의 흐름까지 짚어서 더 깊이",
  },
  relationship_5: {
    default: "너와 상대방의 관계, 서로의 기대와 앞으로의 방향까지",
  },
};

export function getSpreadDescription(
  spread: SpreadType,
  category: SpreadCategory
): string {
  const map = SPREAD_DESCRIPTIONS[spread];
  return map[category] ?? map.default;
}

export const SPREAD_LABELS: Record<SpreadType, Record<string, string[]>> = {
  one_card: { default: ["질문의 답"] },
  two_card: {
    love: ["현재 상황", "상황에 대한 조언"],
    interpersonal: ["현재 관계", "관계에 대한 조언"],
    career: ["현재 상황", "상황에 대한 조언"],
    decision: ["찬성 근거", "반대 근거"],
    mental: ["의식", "무의식"],
    default: ["현재 상황", "상황에 대한 조언"],
  },
  three_card: {
    love: ["나", "상대방", "관계의 방향"],
    interpersonal: ["나", "상대", "관계의 흐름"],
    career: ["과거", "현재", "미래"],
    decision: ["선택지 A", "현재 상태", "선택지 B"],
    mental: ["마음", "몸", "영혼"],
    worry: ["상황", "장애물", "조언"],
    default: ["과거", "현재", "미래"],
  },
  relationship_5: {
    default: ["나", "상대방", "나의 기대", "상대의 기대", "관계의 방향"],
  },
};

export const EMOTION_TO_CATEGORY: Record<EmotionTag, SpreadCategory> = {
  "연애 고민": "love",
  "진로·미래": "career",
  "사람·관계": "interpersonal",
  "돈 걱정": "worry",
  "불안하고 지쳐": "mental",
  "결정을 못 하겠어": "decision",
};

export function getSpreadOptions(category: SpreadCategory): SpreadType[] {
  const base: SpreadType[] = ["one_card", "two_card", "three_card"];
  if (category === "love" || category === "interpersonal") {
    base.push("relationship_5");
  }
  return base;
}

export function getPositionLabels(
  spread: SpreadType,
  category: SpreadCategory
): string[] {
  const map = SPREAD_LABELS[spread];
  return map[category] || map.default;
}

// ===== Drawn Card (sessionStorage contract: /tarot/draw → /tarot/reading) =====

export interface DrawnCard {
  position: number;
  label: string;
  card_id: number;
  direction: "upright" | "reversed";
}
