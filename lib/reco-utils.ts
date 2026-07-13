// lib/reco-utils.ts — 순수 유틸 (클라이언트 번들 안전, Anthropic SDK 미포함)
// lib/reco.ts 에서 re-export 됨. 클라이언트 컴포넌트에서는 이 파일을 직접 import.

export type RecoProduct =
  | "saju:good_days"
  | "saju:nature"
  | "saju:choice"
  | "tarot:relationship_5"
  | "continue"
  | "tarot:clarifier"
  | "extend";

export const RECO_PRODUCTS: RecoProduct[] = [
  "saju:good_days",
  "saju:nature",
  "saju:choice",
  "tarot:relationship_5",
  "continue",
  "tarot:clarifier",
  "extend",
];

/** 결과 카드로 렌더하지 않는 인챗 전용 product — 칩 UI에서만 사용. */
export const INCHAT_ONLY_PRODUCTS: RecoProduct[] = ["tarot:clarifier", "extend"];

export interface NextReco {
  product: RecoProduct;
  question: string | null;
  hook: string | null;
  source: "marker" | "haiku";
  created_at: string;
}

/** 결과 카드 표시 메타 — 라벨·기본 훅 카피·진입 대상. */
export const RECO_DISPLAY: Record<
  RecoProduct,
  { label: string; defaultHook: string; target: "saju" | "tarot" | "continue" | "inchat"; sajuProduct?: string; spreadType?: string }
> = {
  "saju:good_days": {
    label: "사주 · 좋은 날",
    defaultHook: "궁금했던 '그 날'의 결 — 앞으로 30일 흐름은 좋은 날 상담이 짚어줄 수 있어",
    target: "saju",
    sajuProduct: "good_days",
  },
  "saju:nature": {
    label: "사주 · 타고난 결",
    defaultHook: "이 고민의 뿌리 — 타고난 흐름은 사주가 더 깊게 봐줄 수 있어",
    target: "saju",
    sajuProduct: "nature",
  },
  "saju:choice": {
    label: "사주 · 선택의 갈림길",
    defaultHook: "그 선택의 결 — 갈림길은 사주 선택 상담이 같이 봐줄 수 있어",
    target: "saju",
    sajuProduct: "choice",
  },
  "tarot:relationship_5": {
    label: "타로 · 관계 스프레드",
    defaultHook: "그 사람 마음의 결 — 두 사람 자리를 따로 펼치는 관계 카드가 비춰줄 수 있어",
    target: "tarot",
    spreadType: "relationship_5",
  },
  continue: {
    label: "이 고민 이어가기",
    defaultHook: "오늘 못다 푼 매듭 — 지난 맥락 그대로 이어서 볼 수 있어",
    target: "continue",
  },
  "tarot:clarifier": {
    label: "카드 한 장 더 뽑기",
    defaultHook: "이 대화에서 바로 카드 한 장 더 볼 수 있어",
    target: "inchat",
  },
  extend: {
    label: "별콩이랑 더 얘기하기",
    defaultHook: "대화를 4턴 더 이어갈 수 있어",
    target: "inchat",
  },
};

/** 응답 본문 내 [RECO:...] 마커 — 표시 전 반드시 strip. */
export const RECO_MARKER_REGEX = /\[RECO:([a-z0-9_:]+)\]/gi;

export function stripRecoMarkers(text: string): string {
  return text.replace(RECO_MARKER_REGEX, "").replace(/\n{3,}/g, "\n\n");
}

/** 첫 유효 마커의 product 반환 (enum 밖 값은 무시). */
export function parseRecoMarker(text: string): RecoProduct | null {
  for (const m of text.matchAll(RECO_MARKER_REGEX)) {
    const v = m[1].toLowerCase();
    if ((RECO_PRODUCTS as string[]).includes(v)) return v as RecoProduct;
  }
  return null;
}
