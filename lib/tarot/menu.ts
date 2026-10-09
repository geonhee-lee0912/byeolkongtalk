// 타로톡 질문 메뉴판(반반 비교의 메뉴판 그룹) — 질문(감정 태그)마다 맛보기 · 3장 · 깊게(· 끝까지) 상품 카탈로그.
// 전부 기존 스프레드 재포장이다(전용 스프레드 없음). 가격은 tarotPrice(…, "menu"), 카드 자리는 getPositionLabels 가 정본 —
// 여기서 다시 정의하지 말 것. 상품은 리딩의 (emotion_tag, spread_type) 로 복원된다(DB 컬럼 없음).
// 이름 원칙: 이름 = 그 상품이 답하는 질문 · 3장 = 진단 · 깊게 = 이유·방법 · 끝까지 = 앞으로 · 접미사는 맛보기만.
// 스펙: docs/superpowers/specs/2026-10-05-타로톡-메뉴판-별경제-design.md §5 · 부록 A
import { normalizeEmotionTag, type EmotionTag } from "../emotions.ts";
import { EMOTION_TO_CATEGORY, getPositionLabels, type SpreadType } from "./spreads.ts";
import { tarotPrice } from "./pricing.ts";

export type MenuTier = "teaser" | "mid" | "deep" | "full";

/** 위에서부터 이 순서로 보인다 */
export const MENU_TIER_ORDER: readonly MenuTier[] = ["teaser", "mid", "deep", "full"];

export interface MenuProduct {
  /** 계측·판독용 안정 키 `${slug}_${tier}` (예: feelings_deep). 바꾸면 과거 이벤트와 끊긴다 */
  key: string;
  tag: EmotionTag;
  tier: MenuTier;
  spreadType: SpreadType;
  name: string;
}

interface MenuEntry {
  slug: string;
  items: { tier: MenuTier; spreadType: SpreadType; name: string }[];
}

const MENU: Record<EmotionTag, MenuEntry> = {
  "걔 속마음이 궁금해": {
    slug: "feelings",
    items: [
      { tier: "teaser", spreadType: "one_card", name: "지금 걔 마음, 한 장으로" },
      { tier: "mid", spreadType: "three_card", name: "걔와 나, 지금 어떤 사이일까" },
      { tier: "deep", spreadType: "deep_feelings_5", name: "걔가 망설이는 진짜 이유" },
      { tier: "full", spreadType: "potential_7", name: "우리, 앞으로 이어질 수 있을까" },
    ],
  },
  "재회할 수 있을까": {
    slug: "reunion",
    items: [
      { tier: "teaser", spreadType: "one_card", name: "다시 이어질 수 있을지, 한 장으로" },
      { tier: "mid", spreadType: "three_card", name: "우리 사이에 아직 남은 게 있을까" },
      { tier: "deep", spreadType: "reunion_5", name: "재회를 막고 있는 것" },
      { tier: "full", spreadType: "reunion_deep_7", name: "재회, 끝까지 정직하게" },
    ],
  },
  "언제 연락 올까, 타이밍이 궁금해": {
    slug: "contact",
    items: [
      { tier: "teaser", spreadType: "one_card", name: "연락 올까? 한 장으로" },
      { tier: "mid", spreadType: "three_card", name: "연락이 닿을 타이밍의 신호" },
      { tier: "deep", spreadType: "relationship_5", name: "연락을 기다리는 사이, 서로 바라는 것" },
    ],
  },
  "썸, 이 관계 어떻게 될까": {
    slug: "some",
    items: [
      { tier: "teaser", spreadType: "one_card", name: "이 썸의 지금, 한 장으로" },
      { tier: "mid", spreadType: "three_card", name: "우리, 같은 온도일까" },
      { tier: "deep", spreadType: "relationship_5", name: "썸에서 연애로, 서로 바라는 것" },
    ],
  },
  "요즘 우리, 예전 같지 않아": {
    slug: "drift",
    items: [
      { tier: "teaser", spreadType: "one_card", name: "요즘 우리 사이, 한 장으로" },
      { tier: "mid", spreadType: "three_card", name: "우리 사이, 뭐가 달라졌을까" },
      { tier: "deep", spreadType: "checkin_6", name: "우리 관계 체크인, 서로에게 필요한 것" },
    ],
  },
  "새로운 인연, 언제쯤 올까": {
    slug: "newlove",
    items: [
      { tier: "teaser", spreadType: "one_card", name: "새 인연의 기운, 한 장으로" },
      { tier: "mid", spreadType: "three_card", name: "인연이 오기 전, 내가 준비할 것" },
      { tier: "deep", spreadType: "new_love_5", name: "다가올 인연은 어떤 사람일까" },
    ],
  },
  "진로·방향이 고민이야": {
    slug: "career",
    items: [
      { tier: "teaser", spreadType: "one_card", name: "지금 내 방향, 한 장으로" },
      { tier: "mid", spreadType: "three_card", name: "내 길은 지금 어디로 흐르고 있을까" },
      { tier: "deep", spreadType: "stay_or_go_6", name: "남을까 떠날까, 두 갈래 나란히" },
    ],
  },
  "어떤 선택이 맞을지 모르겠어": {
    slug: "choice",
    items: [
      { tier: "teaser", spreadType: "one_card", name: "마음이 기우는 쪽, 한 장으로" },
      { tier: "mid", spreadType: "three_card", name: "두 갈래 길, 지금의 나에게 맞는 쪽" },
      { tier: "deep", spreadType: "stay_or_go_6", name: "후회하지 않을 선택의 기준" },
    ],
  },
  "직장·학교에서 사람이 어려워": {
    slug: "people",
    items: [
      { tier: "teaser", spreadType: "one_card", name: "그 사람과 나, 한 장으로" },
      { tier: "mid", spreadType: "three_card", name: "그 사람과의 관계, 어디로 흘러갈까" },
      { tier: "deep", spreadType: "deep_feelings_5", name: "그 사람이 거리를 두는 이유" },
    ],
  },
  "그냥 별콩이한테 털어놓고 싶어": {
    slug: "talk",
    items: [
      { tier: "teaser", spreadType: "one_card", name: "오늘 내 마음, 한 장으로" },
      { tier: "mid", spreadType: "three_card", name: "요즘 나, 어디가 가장 지쳐 있을까" },
      { tier: "deep", spreadType: "healing_6", name: "남아 있는 마음 돌보기" },
    ],
  },
};

/** 그 질문의 메뉴판(위에서부터 맛보기 → 3장 → 깊게 → 끝까지). 구 태그는 정규화, 모르는 태그면 빈 배열. */
export function getMenu(rawTag: string | null | undefined): MenuProduct[] {
  const tag = normalizeEmotionTag(rawTag);
  if (!tag) return [];
  const entry = MENU[tag];
  return entry.items.map((it) => ({ key: `${entry.slug}_${it.tier}`, tag, ...it }));
}

/** 그 질문의 깊게(별콩이 추천) 상품 — 맛보기 끝 "이어서 깊게"가 파는 것. */
export function getDeepProduct(rawTag: string | null | undefined): MenuProduct | null {
  return getMenu(rawTag).find((p) => p.tier === "deep") ?? null;
}

/** 리딩의 (emotion_tag, spread_type) → 메뉴 상품. 메뉴 밖 조합(투카드·옛 큐레이션)은 null. */
export function productForReading(
  rawTag: string | null | undefined,
  spreadType: string | null | undefined
): MenuProduct | null {
  return getMenu(rawTag).find((p) => p.spreadType === spreadType) ?? null;
}

/** 상품의 카드 자리 이름 — getPositionLabels 그대로(중복 정의 금지). */
export function productPositions(p: MenuProduct): string[] {
  return getPositionLabels(p.spreadType, EMOTION_TO_CATEGORY[p.tag], p.tag);
}

/** 상품 가격(별) — 메뉴판 그룹 가격. 서버도 같은 함수로 차감한다(lib/tarot/pricing.ts). */
export function productPrice(p: MenuProduct): number {
  return tarotPrice(p.spreadType, "menu");
}
