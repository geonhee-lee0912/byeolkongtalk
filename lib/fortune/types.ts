// 별콩 운세 — 대화형(채팅) 아님. 입력 → 한 번에 분석형 리포트 1장.
// 기존 readings 테이블 재사용 (스키마 변경 없음): emotion_tag 에 센티넬로 운세 종류 표시.

export type FortuneType = "daily" | "saju_full" | "tarot_oneshot" | "compat";

export interface FortuneConfig {
  type: FortuneType;
  label: string;
  emoji: string;
  tagline: string;
  /** 기반 도메인 — readings.consultation_type 에 그대로 들어감 ('saju' | 'tarot') */
  base: "saju" | "tarot";
  /** 별 비용. 0 = 무료 */
  cost: number;
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
    tagline: "생일만 알려주면 오늘 하루 흐름을 짚어줄게",
    base: "saju",
    cost: 0,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}daily`,
    href: "/fortune/daily",
    active: true,
  },
  saju_full: {
    type: "saju_full",
    label: "사주 종합 분석",
    emoji: "🪷",
    tagline: "타고난 기질부터 올해 흐름까지 한 장에 정리",
    base: "saju",
    cost: 15,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}saju_full`,
    href: "/fortune/saju",
    active: false,
  },
  tarot_oneshot: {
    type: "tarot_oneshot",
    label: "타로 원샷 리딩",
    emoji: "🃏",
    tagline: "카드 한 장으로 지금 질문에 바로 답을",
    base: "tarot",
    cost: 10,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}tarot_oneshot`,
    href: "/fortune/tarot",
    active: false,
  },
  compat: {
    type: "compat",
    label: "궁합·관계 분석",
    emoji: "💞",
    tagline: "두 사람 사주로 관계 흐름과 궁합을",
    base: "saju",
    cost: 20,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}compat`,
    href: "/fortune/compat",
    active: false,
  },
};

export const FORTUNE_LIST: FortuneConfig[] = [
  FORTUNE_CONFIG.daily,
  FORTUNE_CONFIG.saju_full,
  FORTUNE_CONFIG.tarot_oneshot,
  FORTUNE_CONFIG.compat,
];

/** emotion_tag 가 운세 센티넬이면 FortuneType 반환, 아니면 null */
export function fortuneTypeFromTag(tag: string | null | undefined): FortuneType | null {
  if (!tag || !tag.startsWith(FORTUNE_SENTINEL_PREFIX)) return null;
  const t = tag.slice(FORTUNE_SENTINEL_PREFIX.length) as FortuneType;
  return t in FORTUNE_CONFIG ? t : null;
}
