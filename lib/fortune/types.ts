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
  | "compat_social"
  | "good_days";

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
    // 전면 무료 — 하루 1회(같은 날 이미 본 리딩 반환, create 라우트 alreadyToday).
    cost: 0,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}daily`,
    href: "/fortune/daily",
    active: true,
  },
  monthly: {
    type: "monthly",
    label: "이번달 어떤 일들이?",
    emoji: "🗓️",
    tagline: "이번 한 달, 너의 흐름을 미리 짚어줄게",
    base: "saju",
    cost: 20,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}monthly`,
    href: "/fortune/monthly",
    active: true,
  },
  saju_full: {
    type: "saju_full",
    label: "2026년 사주 분석",
    emoji: "2️⃣6️⃣",
    tagline: "2026년 한 해의 흐름을 내 사주로 한 장에",
    base: "saju",
    cost: 60,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}saju_full`,
    href: "/fortune/saju_full",
    active: true,
  },
  // 진열대(FORTUNE_LIST)에서는 제거됨(W1 사주 진열대 재편) — 과거 reading 렌더 + fortuneTypeFromTag
  // 하위호환을 위해 config는 유지. active: false → 직링크 진입 시 /fortune/tarot/[type] 이 notFound() 처리.
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
    active: false,
  },
  tarot_love: {
    type: "tarot_love",
    label: "연애운 타로",
    emoji: "💗",
    tagline: "지금 너의 연애, 카드 세 장으로 풀어볼게",
    base: "tarot",
    cost: 20,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}tarot_love`,
    href: "/fortune/tarot/tarot_love",
    active: false,
  },
  tarot_money: {
    type: "tarot_money",
    label: "금전운 타로",
    emoji: "💰",
    tagline: "돈의 흐름과 기회를 카드로 짚어줄게",
    base: "tarot",
    cost: 20,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}tarot_money`,
    href: "/fortune/tarot/tarot_money",
    active: false,
  },
  tarot_career: {
    type: "tarot_career",
    label: "직장·진로 타로",
    emoji: "💼",
    tagline: "일과 진로의 갈림길, 카드가 길을 보여줄게",
    base: "tarot",
    cost: 20,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}tarot_career`,
    href: "/fortune/tarot/tarot_career",
    active: false,
  },
  tarot_relation: {
    type: "tarot_relation",
    label: "인간관계 타로",
    emoji: "🤝",
    tagline: "사람 사이의 거리, 카드로 들여다볼게",
    base: "tarot",
    cost: 20,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}tarot_relation`,
    href: "/fortune/tarot/tarot_relation",
    active: false,
  },
  compat: {
    type: "compat",
    label: "사랑하는 사람과의 궁합 분석",
    emoji: "💞",
    tagline: "두 사람 사주로 연애·결혼 궁합을 깊이 봐줄게",
    base: "saju",
    cost: 40,
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
    cost: 35,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}compat_social`,
    href: "/fortune/compat-social",
    active: true,
  },
  good_days: {
    type: "good_days",
    label: "좋은 날 리포트",
    emoji: "📅",
    tagline: "앞으로 한 달, 너에게 좋은 날과 조심할 날",
    base: "saju",
    cost: 35,
    emotionTag: `${FORTUNE_SENTINEL_PREFIX}good_days`,
    href: "/fortune/good_days",
    active: true,
  },
};

export const FORTUNE_LIST: FortuneConfig[] = [
  FORTUNE_CONFIG.compat,
  FORTUNE_CONFIG.compat_social,
  FORTUNE_CONFIG.saju_full,
  FORTUNE_CONFIG.monthly,
  FORTUNE_CONFIG.good_days,
  FORTUNE_CONFIG.daily,
];

/** 운세 종류별 타일 그라데이션 — 의미 그룹별 (궁합=핑크·로즈 / 타이밍=골드 / 무료=민트). */
export const FORTUNE_GRADIENTS: Record<FortuneType, string> = {
  daily: "linear-gradient(135deg, #E4F6E8 0%, #C2E8CC 100%)",
  monthly: "linear-gradient(135deg, #FFF2D2 0%, #F8D888 100%)",
  saju_full: "linear-gradient(135deg, #FFEAC4 0%, #F3C25E 100%)",
  compat: "linear-gradient(135deg, #FCE7EE 0%, #F8C9D6 100%)",
  compat_social: "linear-gradient(135deg, #FBEAF2 0%, #F2BFD3 100%)",
  tarot_daily: "linear-gradient(135deg, #EFEAF6 0%, #DACFEC 100%)",
  tarot_love: "linear-gradient(135deg, #FFEFE3 0%, #FACDB4 100%)",
  tarot_money: "linear-gradient(135deg, #FFF8DD 0%, #FBE89E 100%)",
  tarot_career: "linear-gradient(135deg, #DEF1EC 0%, #BAE0D4 100%)",
  tarot_relation: "linear-gradient(135deg, #E4F6E8 0%, #C2E8CC 100%)",
  good_days: "linear-gradient(135deg, #FFEAC4 0%, #F3C25E 100%)",
};

/** 운세 종류별 해시태그 (홈 카드 #태그 칩 스타일) */
export const FORTUNE_HASHTAGS: Record<FortuneType, string[]> = {
  daily: ["오늘", "하루흐름", "가볍게"],
  monthly: ["이번달", "한달흐름", "미리보기"],
  saju_full: ["신년사주", "총운", "타고난기질"],
  compat: ["궁합", "연애", "결혼"],
  compat_social: ["관계궁합", "케미", "친구가족"],
  tarot_daily: ["오늘", "한장", "메시지"],
  tarot_love: ["연애", "썸", "상대마음"],
  tarot_money: ["금전", "기회", "재물운"],
  tarot_career: ["직장", "진로", "이직"],
  tarot_relation: ["인간관계", "거리", "소통"],
  good_days: ["좋은날", "택일", "한달흐름"],
};

/**
 * 운세 종류별 one-shot 리포트 max_tokens — 분량 차등 (사주분석은 풀 리포트).
 * Sonnet 5 새 토크나이저는 같은 글자가 ~30% 더 많은 토큰이라, 기존 4.6 캡을
 * ×1.3 상향해 동일 분량을 보존(안 그러면 리포트가 짧아지고 [END]/JSON 이 잘림).
 *
 * 🔴 리포트의 SECTION_GUIDE(prompt.ts) 문장 수·필드를 늘리면 여기 캡도 함께 올릴 것.
 * 캡이 자연 생성 길이보다 낮으면 stop_reason=max_tokens 로 JSON 이 잘리고 →
 * parseReportJson 이 절단 객체를 거부(null) → 재시도(같은 캡이라 또 절단) → 리딩 삭제·
 * 환불("compat report parse failed"). 실측·꼬리 확인은 scripts/fortune-length-probe.ts
 * (⚠️TRUNCATED 플래그, 변동폭 크니 여러 번 실행). compat/compat_social 은 Phase A(2026-08-13)
 * 로 소통법·성장 섹션이 추가돼 ~74문장 깊이가 됐는데 캡은 7800 그대로라 verbose 꼬리가
 * 7800 을 넘겨 prod truncation 발생(2026-08-28) → 14000 으로 상향(saju_full 15600 미만 유지).
 *
 * good_days: luna 이관(2026-08-29)으로 산문이 sonnet 대비 ~63% 길어짐(실측 ~4900~5400자, 무증상
 * 절단 위험 — good_days 는 마크다운이라 parseReportJson 이 절단을 못 잡는다) → 6500→8500 여유 상향.
 * 전면 분량·가격 재설계는 별도 브레인스토밍 예정(여긴 luna 안전 마진만).
 */
export const MAX_TOKENS_BY_FORTUNE: Record<FortuneType, number> = {
  daily: 3380,
  monthly: 6500,
  saju_full: 22000,
  tarot_daily: 2660,
  tarot_love: 5200,
  tarot_money: 5200,
  tarot_career: 5200,
  tarot_relation: 5200,
  compat: 14000,
  compat_social: 14000,
  good_days: 8500,
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

// ── 카테고리(필터 칩) ─────────────────────────────────────────────
// 2탭 사주 운세의 필터 칩 배치. 단일 원천 (spec 2026-08-03-fortune-tab-design).
// "나" 칩은 지금 없음 — 기질·정체성 리포트가 쌓이면 부활(2026 사주는 그때 timing→나로 이동).

export type FortuneCategory = "love_relation" | "timing" | "free";

/** 모든 FortuneType → 칩 카테고리. 진열 안 하는 tarot_* 는 null. */
export const FORTUNE_CATEGORY: Record<FortuneType, FortuneCategory | null> = {
  compat: "love_relation",
  compat_social: "love_relation",
  saju_full: "timing",
  monthly: "timing",
  good_days: "timing",
  daily: "free",
  tarot_daily: null,
  tarot_love: null,
  tarot_money: null,
  tarot_career: null,
  tarot_relation: null,
};

/** 칩 노출 순서·라벨. */
export const FORTUNE_CHIPS: { key: FortuneCategory; label: string }[] = [
  { key: "love_relation", label: "연애·관계" },
  { key: "timing", label: "타이밍" },
  { key: "free", label: "무료" },
];

/** 첫 진입 시 활성 칩 (3개라 화면이 풍성 + 60별 대표 노출). */
export const DEFAULT_FORTUNE_CHIP: FortuneCategory = "timing";

/** 칩 카테고리에 속한 진열 상품 (FORTUNE_LIST 순서 보존). */
export function fortuneProductsByCategory(cat: FortuneCategory): FortuneConfig[] {
  return FORTUNE_LIST.filter((f) => FORTUNE_CATEGORY[f.type] === cat);
}
