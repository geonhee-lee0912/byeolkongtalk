// 별콩 운세 — 대화형(채팅) 아님. 입력 → 한 번에 분석형 리포트 1장.
// 기존 readings 테이블 재사용 (스키마 변경 없음): emotion_tag 에 센티넬로 운세 종류 표시.

export type FortuneType =
  | "daily"
  | "monthly"
  | "saju_full"
  | "tarot_daily"
  | "tarot_love"
  | "tarot_money"
  | "tarot_career"
  | "tarot_relation"
  | "compat"
  | "compat_social";

export type TarotFortuneType =
  | "tarot_daily"
  | "tarot_love"
  | "tarot_money"
  | "tarot_career"
  | "tarot_relation";

export interface FortuneConfig {
  type: FortuneType;
  label: string;
  emoji: string;
  tagline: string;
  /** 기반 도메인 — readings.consultation_type 에 그대로 들어감 ('saju' | 'tarot') */
  base: "saju" | "tarot";
  /** 별 비용. 0 = 무료 */
  cost: number;
  /** 계정당 평생 누적 무료 횟수. 설정 시 소진 후 paidCost 과금 */
  freeLimit?: number;
  /** 무료 소진 후 회당 비용 */
  paidCost?: number;
  /** readings.emotion_tag 센티넬 — `${PREFIX}${type}` */
  emotionTag: string;
  /** 입력 화면 라우트 */
  href: string;
  /** Phase 1 에서 실제 동작 여부. false 면 랜딩에서 '준비 중' */
  active: boolean;
}

export const FORTUNE_SENTINEL_PREFIX = "fortune:";

export const FORTUNE_CONFIG: Record<FortuneType, FortuneConfig> = {
  daily: {
    type: "daily",
    label: "오늘의 운세",
    emoji: "🌤️",
    tagline: "오늘 하루 흐름을 짚어줄게",
    base: "saju",
    cost: 0,
    freeLimit: 5,
    paidCost: 5,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}daily`,
    href: "/fortune/daily",
    active: true,
  },
  monthly: {
    type: "monthly",
    label: "이번달 어떤 일들이?",
    emoji: "🗓️",
    tagline: "이번 한 달, 너에게 들어올 흐름을 미리 짚어줄게",
    base: "saju",
    cost: 15,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}monthly`,
    href: "/fortune/monthly",
    active: true,
  },
  saju_full: {
    type: "saju_full",
    label: "2026년 사주 분석",
    emoji: "2️⃣6️⃣",
    tagline: "타고난 기질부터 2026년 한 해 흐름까지 한 장에",
    base: "saju",
    cost: 50,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}saju_full`,
    href: "/fortune/saju_full",
    active: true,
  },
  tarot_daily: {
    type: "tarot_daily",
    label: "오늘의 타로",
    emoji: "🃏",
    tagline: "오늘 너에게 오는 한 장의 메시지",
    base: "tarot",
    cost: 0,
    freeLimit: 5,
    paidCost: 5,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}tarot_daily`,
    href: "/fortune/tarot/tarot_daily",
    active: true,
  },
  tarot_love: {
    type: "tarot_love",
    label: "연애운 타로",
    emoji: "💗",
    tagline: "지금 너의 연애, 카드 세 장으로 풀어볼게",
    base: "tarot",
    cost: 15,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}tarot_love`,
    href: "/fortune/tarot/tarot_love",
    active: true,
  },
  tarot_money: {
    type: "tarot_money",
    label: "금전운 타로",
    emoji: "💰",
    tagline: "돈의 흐름과 기회를 카드로 짚어줄게",
    base: "tarot",
    cost: 15,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}tarot_money`,
    href: "/fortune/tarot/tarot_money",
    active: true,
  },
  tarot_career: {
    type: "tarot_career",
    label: "직장·진로 타로",
    emoji: "💼",
    tagline: "일과 진로의 갈림길, 카드가 길을 보여줄게",
    base: "tarot",
    cost: 15,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}tarot_career`,
    href: "/fortune/tarot/tarot_career",
    active: true,
  },
  tarot_relation: {
    type: "tarot_relation",
    label: "인간관계 타로",
    emoji: "🤝",
    tagline: "사람 사이의 거리, 카드로 들여다볼게",
    base: "tarot",
    cost: 15,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}tarot_relation`,
    href: "/fortune/tarot/tarot_relation",
    active: true,
  },
  compat: {
    type: "compat",
    label: "사랑하는 사람과의 궁합 분석",
    emoji: "💞",
    tagline: "두 사람 사주로 연애·결혼 궁합을 깊이 봐줄게",
    base: "saju",
    cost: 20,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}compat`,
    href: "/fortune/compat",
    active: true,
  },
  compat_social: {
    type: "compat_social",
    label: "인간 관계 궁합 분석",
    emoji: "🤝",
    tagline: "친구·가족·동료, 두 사람 사주로 관계 케미를",
    base: "saju",
    cost: 20,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}compat_social`,
    href: "/fortune/compat-social",
    active: true,
  },
};

export const FORTUNE_LIST: FortuneConfig[] = [
  FORTUNE_CONFIG.daily,
  FORTUNE_CONFIG.monthly,
  FORTUNE_CONFIG.saju_full,
  FORTUNE_CONFIG.tarot_daily,
  FORTUNE_CONFIG.tarot_love,
  FORTUNE_CONFIG.tarot_money,
  FORTUNE_CONFIG.tarot_career,
  FORTUNE_CONFIG.tarot_relation,
  FORTUNE_CONFIG.compat,
  FORTUNE_CONFIG.compat_social,
];

/** 운세 종류별 one-shot 리포트 max_tokens — 분량 차등 (사주분석은 풀 리포트) */
export const MAX_TOKENS_BY_FORTUNE: Record<FortuneType, number> = {
  daily: 2600,
  monthly: 5000,
  saju_full: 12000,
  tarot_daily: 2048,
  tarot_love: 4000,
  tarot_money: 4000,
  tarot_career: 4000,
  tarot_relation: 4000,
  compat: 6000,
  compat_social: 6000,
};

/** emotion_tag 가 운세 센티넬이면 FortuneType 반환, 아니면 null */
export function fortuneTypeFromTag(tag: string | null | undefined): FortuneType | null {
  if (!tag || !tag.startsWith(FORTUNE_SENTINEL_PREFIX)) return null;
  const t = tag.slice(FORTUNE_SENTINEL_PREFIX.length) as FortuneType;
  return t in FORTUNE_CONFIG ? t : null;
}

// 타로 운세 타입별 카드 포지션. cardCount의 단일 진실 원천(length로 카드 수 결정).
export const TAROT_POSITIONS: Record<TarotFortuneType, string[]> = {
  tarot_daily: ["오늘의 메시지"],
  tarot_love: ["나의 마음", "상대의 마음", "관계의 흐름"],
  tarot_money: ["현재 흐름", "장애물", "기회·조언"],
  tarot_career: ["현재 위치", "변화의 기류", "나아갈 길"],
  tarot_relation: ["나", "상대·무리", "관계의 방향"],
};

export function getTarotPositions(type: string): string[] | null {
  return type in TAROT_POSITIONS
    ? TAROT_POSITIONS[type as TarotFortuneType]
    : null;
}
