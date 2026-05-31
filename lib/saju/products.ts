// 사주 4종 상품 정의 — /select UI + 프롬프트 분기 + readings 검증이 공유하는 단일 소스.

import type { EmotionTag } from "@/lib/emotions";

export type SajuProduct = "today_letters" | "nature" | "choice" | "good_days";

export const SAJU_PRODUCTS: SajuProduct[] = [
  "today_letters",
  "nature",
  "choice",
  "good_days",
];

export interface SajuProductInfo {
  id: SajuProduct;
  /** 카드 타이틀 pill */
  label: string;
  /** 카드 설명글 한 줄 */
  description: string;
  /** 카드 하단 대표 흐름 라벨 (accent 컬러) */
  flow: string;
}

export const SAJU_PRODUCT_INFO: Record<SajuProduct, SajuProductInfo> = {
  today_letters: {
    id: "today_letters",
    label: "오늘 들어온 글자",
    description: "오늘 너에게 들어온 일운 두 글자로 고민을 짚어줄게",
    flow: "오늘 일운 · 고민 연결 · 금기 포인트",
  },
  nature: {
    id: "nature",
    label: "타고난 성향 기반 상담",
    description: "타고난 팔자에서 출발해 지금 흐름으로 고민을 풀어줄게",
    flow: "타고난 기질 · 지금 흐름 · 고민 적용",
  },
  choice: {
    id: "choice",
    label: "선택지 비교",
    description: "고민 속 선택지를 일운·오행 흐름으로 나란히 비교해줄게",
    flow: "선택지 A · 선택지 B · 기우는 쪽",
  },
  good_days: {
    id: "good_days",
    label: "좋은 날 추천",
    description: "앞으로 한 달, 너에게 좋은 날과 피할 날을 짚어줄게",
    flow: "팔자 해석 · 좋은 날 · 피할 날",
  },
};

/** 선택지 비교 노출 대상 감정 분류 (선택/진로/새출발). */
const CHOICE_ELIGIBLE_EMOTIONS: EmotionTag[] = [
  "어떤 선택이 맞을지 모르겠어",
  "내 앞날의 방향이 궁금해",
  "새로운 시작이 기대돼",
];

export function isChoiceEligible(emotion: EmotionTag | string | null | undefined): boolean {
  return !!emotion && (CHOICE_ELIGIBLE_EMOTIONS as string[]).includes(emotion);
}

/** 주어진 감정에서 노출할 상품 목록 (choice 게이팅 적용). */
export function getSajuProducts(emotion: EmotionTag | string | null | undefined): SajuProduct[] {
  return SAJU_PRODUCTS.filter((p) => p !== "choice" || isChoiceEligible(emotion));
}

export function isSajuProduct(v: unknown): v is SajuProduct {
  return typeof v === "string" && (SAJU_PRODUCTS as string[]).includes(v);
}
