import {
  type EmotionTag,
  normalizeEmotionTag,
} from "@/lib/emotions";

// ===== Spread Types =====

export type SpreadType =
  | "one_card"
  | "two_card"
  | "three_card"
  | "relationship_5"
  // W1 신설 10종 (DB spread_type VARCHAR(20) 이내)
  | "deep_feelings_5"
  | "reunion_5"
  | "reunion_deep_7"
  | "potential_7"
  | "checkin_6"
  | "stay_or_go_6"
  | "new_love_5"
  | "readiness_6"
  | "healing_6"
  | "chakra_7";

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
  accent: string;
}

export const SPREAD_INFO: Record<SpreadType, SpreadInfo> = {
  one_card: {
    type: "one_card", cardCount: 1, starCost: 10,
    label: "원카드", tagline: "한 장으로 가볍게",
    description: "빠르게 한 줄, 지금 고민에 대한 답이 필요할 때",
    accent: "#6B8DD6",
  },
  two_card: {
    type: "two_card", cardCount: 2, starCost: 15,
    label: "투카드", tagline: "두 장으로 균형있게",
    description: "너의 상황과 그에 대한 조언, 양쪽을 같이 봐줄게",
    accent: "#65B28F",
  },
  three_card: {
    type: "three_card", cardCount: 3, starCost: 25,
    label: "쓰리카드", tagline: "세 장으로 입체적으로",
    description: "세 장을 이어서 흐름까지 짚어줄게",
    accent: "#E0976B",
  },
  relationship_5: {
    type: "relationship_5", cardCount: 5, starCost: 40,
    label: "관계 스프레드", tagline: "다섯 장으로 두 사람을",
    description: "너와 상대방의 관계, 서로의 기대와 앞으로의 방향까지",
    accent: "#D4708F",
  },
  deep_feelings_5: {
    type: "deep_feelings_5", cardCount: 5, starCost: 40,
    label: "속마음 심층", tagline: "그 사람만 다섯 장으로",
    description: "겉모습 뒤의 진짜 속마음과 망설임, 다가올 태도까지 깊이",
    accent: "#C25C8A",
  },
  reunion_5: {
    type: "reunion_5", cardCount: 5, starCost: 40,
    label: "재회 스프레드", tagline: "다시 이어질 결을",
    description: "두 사람을 막고 있는 것과 다시 이어질 가능성을 봐줄게",
    accent: "#9F8AD0",
  },
  reunion_deep_7: {
    type: "reunion_deep_7", cardCount: 7, starCost: 55,
    label: "재회 심층", tagline: "일곱 장으로 정직하게",
    description: "서로의 몫과 회복의 조건, 재회가 너에게 갖는 의미까지",
    accent: "#7E6BB5",
  },
  potential_7: {
    type: "potential_7", cardCount: 7, starCost: 55,
    label: "가능성 스프레드", tagline: "장기 잠재력까지",
    description: "지금 상황부터 다음 단계, 멀리의 잠재력까지 일곱 장으로",
    accent: "#4E8FB8",
  },
  checkin_6: {
    type: "checkin_6", cardCount: 6, starCost: 45,
    label: "관계 체크인", tagline: "서로의 필요를 나란히",
    description: "두 사람의 상태와 서로에게 필요한 것을 대칭으로 점검해",
    accent: "#5CA88F",
  },
  stay_or_go_6: {
    type: "stay_or_go_6", cardCount: 6, starCost: 45,
    label: "계속? 그만?", tagline: "두 갈래를 나란히",
    description: "머무를 이유와 떠날 이유, 각 선택 뒤의 너를 비교해줄게",
    accent: "#C98A4B",
  },
  new_love_5: {
    type: "new_love_5", cardCount: 5, starCost: 40,
    label: "새 인연 찾기", tagline: "다가올 인연의 결",
    description: "새 인연의 특성과 만나게 될 환경, 관계의 방향까지",
    accent: "#6FAE6F",
  },
  readiness_6: {
    type: "readiness_6", cardCount: 6, starCost: 45,
    label: "새 사랑 준비도", tagline: "나부터 들여다보기",
    description: "지난 연애의 교훈과 방해 요소, 마음·생각·삶의 준비 상태",
    accent: "#8FA85C",
  },
  healing_6: {
    type: "healing_6", cardCount: 6, starCost: 45,
    label: "마음 치유", tagline: "남은 상처 돌보기",
    description: "반복되는 패턴과 남은 상처, 놓아주기 위한 방향을 짚어줄게",
    accent: "#B58AA5",
  },
  chakra_7: {
    type: "chakra_7", cardCount: 7, starCost: 55,
    label: "마음 차크라", tagline: "나를 일곱 층으로",
    description: "안정감부터 삶의 의미까지, 지금의 나를 일곱 층위로 봐줄게",
    accent: "#7D74C9",
  },
};

// ===== 태그 → 카테고리 (spread_category 저장·라벨 폴백용) =====

export const EMOTION_TO_CATEGORY: Record<EmotionTag, SpreadCategory> = {
  "걔 속마음이 궁금해": "love",
  "재회할 수 있을까": "love",
  "언제 연락 올까, 타이밍이 궁금해": "love",
  "썸, 이 관계 어떻게 될까": "love",
  "요즘 우리, 예전 같지 않아": "love",
  "새로운 인연, 언제쯤 올까": "love",
  "진로·방향이 고민이야": "career",
  "어떤 선택이 맞을지 모르겠어": "decision",
  "직장·학교에서 사람이 어려워": "interpersonal",
  "그냥 별콩이한테 털어놓고 싶어": "mental",
};

// ===== 태그당 5개 큐레이션 (스펙 §3 매트릭스) =====

export const TAG_SPREADS: Record<EmotionTag, SpreadType[]> = {
  "걔 속마음이 궁금해":
    ["one_card", "two_card", "three_card", "deep_feelings_5", "potential_7"],
  "재회할 수 있을까":
    ["one_card", "two_card", "three_card", "reunion_5", "reunion_deep_7"],
  "언제 연락 올까, 타이밍이 궁금해":
    ["one_card", "two_card", "three_card", "relationship_5", "potential_7"],
  "썸, 이 관계 어떻게 될까":
    ["one_card", "two_card", "three_card", "relationship_5", "potential_7"],
  "요즘 우리, 예전 같지 않아":
    ["one_card", "two_card", "three_card", "checkin_6", "stay_or_go_6"],
  "새로운 인연, 언제쯤 올까":
    ["one_card", "two_card", "three_card", "new_love_5", "readiness_6"],
  "진로·방향이 고민이야":
    ["one_card", "two_card", "three_card", "stay_or_go_6", "potential_7"],
  "어떤 선택이 맞을지 모르겠어":
    ["one_card", "two_card", "three_card", "stay_or_go_6", "potential_7"],
  "직장·학교에서 사람이 어려워":
    ["one_card", "two_card", "three_card", "deep_feelings_5", "checkin_6"],
  "그냥 별콩이한테 털어놓고 싶어":
    ["one_card", "two_card", "three_card", "healing_6", "chakra_7"],
};

/** 태그 기반 큐레이션. 구 태그·미지의 문자열은 기본 3종 폴백. */
export function getSpreadOptionsForTag(rawTag: string): SpreadType[] {
  const tag = normalizeEmotionTag(rawTag);
  if (tag) return TAG_SPREADS[tag];
  return ["one_card", "two_card", "three_card"];
}

// ===== 포지션 라벨: 카테고리 기본 + 태그 오버라이드 =====

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
    love: ["나", "상대방", "둘 사이의 에너지"],
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
  deep_feelings_5: {
    default: ["겉으로 보이는 태도", "진짜 속마음", "망설이는 이유", "나에 대한 진심", "다가올 태도"],
    interpersonal: ["겉으로 보이는 태도", "그 사람의 속마음", "거리를 두는 이유", "나에 대한 평가", "다가올 태도"],
  },
  reunion_5: {
    default: ["나의 현재", "그 사람의 현재", "막고 있는 문제", "필요한 행동", "향후 가능성"],
  },
  reunion_deep_7: {
    default: ["나의 몫", "그 사람의 몫", "나의 회복 행동", "상대의 회복 조건", "외부 요인", "회복 가능성", "재회의 의미"],
  },
  potential_7: {
    default: ["둘러싼 상황", "나", "상대방", "조언", "도전 요소", "다음 단계", "장기 잠재력"],
    career: ["둘러싼 상황", "지금의 나", "목표", "조언", "도전 요소", "다음 단계", "장기 잠재력"],
    decision: ["둘러싼 상황", "지금의 나", "기우는 선택", "조언", "도전 요소", "다음 단계", "장기 잠재력"],
  },
  checkin_6: {
    default: ["지금의 나", "지금의 상대", "둘 사이 에너지", "내가 필요한 것", "상대가 필요한 것", "나아갈 방향"],
    interpersonal: ["지금의 나", "그 사람", "둘 사이 공기", "내가 필요한 것", "그 사람의 입장", "관계의 방향"],
  },
  stay_or_go_6: {
    default: ["현재 상태", "머무를 이유", "떠날 이유", "계속일 때의 나", "떠날 때의 나", "결정의 기준"],
    career: ["현재 상태", "남을 이유", "떠날 이유", "남을 때의 나", "떠날 때의 나", "결정의 기준"],
    decision: ["현재 상태", "A를 고를 이유", "B를 고를 이유", "A 이후의 나", "B 이후의 나", "결정의 기준"],
  },
  new_love_5: {
    default: ["나의 준비 상태", "다가올 인연의 결", "만남의 환경", "관계의 성격", "관계의 방향"],
  },
  readiness_6: {
    default: ["내가 원하는 사랑", "지난 연애의 교훈", "방해하는 것", "감정의 준비", "생각의 준비", "삶의 준비"],
  },
  healing_6: {
    default: ["과거의 패턴", "남아 있는 상처", "지금의 상태", "상처가 드러나는 방식", "치유의 모습", "놓아주는 방향"],
  },
  chakra_7: {
    default: ["안정감", "욕구", "자존감", "감정", "표현", "직관", "의미"],
  },
};

/** 태그별 라벨 오버라이드 (카테고리 기본으로 부족한 경우만) */
const TAG_LABEL_OVERRIDES: Partial<
  Record<EmotionTag, Partial<Record<SpreadType, string[]>>>
> = {
  "언제 연락 올까, 타이밍이 궁금해": {
    three_card: ["지금의 흐름", "전환점", "다가올 신호"],
  },
  "재회할 수 있을까": {
    three_card: ["나", "그 사람", "남은 결"],
  },
  "새로운 인연, 언제쯤 올까": {
    three_card: ["지금의 나", "다가올 기류", "준비할 것"],
  },
};

export function getPositionLabels(
  spread: SpreadType,
  category: SpreadCategory,
  rawTag?: string | null
): string[] {
  const tag = rawTag ? normalizeEmotionTag(rawTag) : null;
  const override = tag ? TAG_LABEL_OVERRIDES[tag]?.[spread] : undefined;
  if (override) return override;
  const map = SPREAD_LABELS[spread];
  return map[category] || map.default;
}

// ===== 스프레드 설명 (선택 카드용) — 카테고리별 =====

export const SPREAD_DESCRIPTIONS: Record<
  SpreadType,
  Partial<Record<SpreadCategory, string>> & { default: string }
> = {
  one_card: {
    love: "지금 이 고민, 한 장에 담긴 힌트로 답을 찾자",
    career: "진로 고민, 한 줄 답이 필요할 때",
    decision: "지금 떠오르는 한 장이 답의 실마리가 돼",
    mental: "지친 마음에 필요한 한 장의 위로",
    interpersonal: "지금 관계에 대한 실마리를 한 장에 담아줄게",
    default: "빠르게 한 줄, 지금 고민에 대한 답이 필요할 때",
  },
  two_card: {
    love: "지금 상황과 조언, 양쪽을 같이 봐줄게",
    decision: "찬반 두 장을 나란히 놓고 들여다보자",
    mental: "의식과 무의식, 마음 두 면을 같이 볼게",
    interpersonal: "관계 상황과 풀어갈 실마리를 같이 봐줄게",
    default: "너의 상황과 그에 대한 조언, 양쪽을 같이 봐줄게",
  },
  three_card: {
    love: "너와 상대, 둘 사이의 에너지까지 깊이 봐줄게",
    career: "과거·현재·미래 흐름으로 방향을 비춰줄게",
    decision: "선택지 둘과 지금 상태를 같이 놓고 보자",
    mental: "마음·몸·영혼 세 층으로 너를 들여다볼게",
    interpersonal: "나·상대·관계 흐름을 세 장으로 풀어줄게",
    default: "세 장을 이어서 흐름까지 짚어줄게",
  },
  relationship_5: { default: "너와 상대방의 관계, 서로의 기대와 앞으로의 방향까지" },
  deep_feelings_5: {
    interpersonal: "그 사람의 속마음과 나에 대한 평가를 다섯 장으로",
    default: "그 사람 한 명을 다섯 장으로 깊이 — 겉모습 뒤의 진심까지",
  },
  reunion_5: { default: "이별의 매듭과 다시 이어질 가능성을 다섯 장으로" },
  reunion_deep_7: { default: "서로의 몫과 회복의 조건, 재회의 의미까지 정직하게" },
  potential_7: {
    career: "커리어의 다음 단계와 장기 잠재력까지 일곱 장으로",
    default: "이 관계가 어디까지 갈 수 있는지, 잠재력까지 일곱 장으로",
  },
  checkin_6: {
    interpersonal: "그 사람과의 관계를 여섯 장으로 점검해보자",
    default: "두 사람의 상태와 서로의 필요를 나란히 점검해보자",
  },
  stay_or_go_6: {
    career: "남을까 떠날까, 두 갈래 뒤의 너를 비교해줄게",
    decision: "두 선택 뒤의 너를 나란히 놓고 비교해줄게",
    default: "계속 갈지 멈출지, 두 갈래 뒤의 감정까지 비교해줄게",
  },
  new_love_5: { default: "다가올 인연의 결과 만나게 될 환경까지 다섯 장으로" },
  readiness_6: { default: "새 사랑을 시작할 준비가 됐는지, 나부터 들여다보자" },
  healing_6: { default: "반복되는 패턴과 남은 상처, 놓아주는 방향까지" },
  chakra_7: { default: "지금의 나를 일곱 층위로 — 안정감부터 삶의 의미까지" },
};

export function getSpreadDescription(
  spread: SpreadType,
  category: SpreadCategory
): string {
  const map = SPREAD_DESCRIPTIONS[spread];
  return map[category] ?? map.default;
}

// ===== Drawn Card (sessionStorage contract: /tarot/draw → /tarot/reading) =====

export interface DrawnCard {
  position: number;
  label: string;
  card_id: number;
  direction: "upright" | "reversed";
}
