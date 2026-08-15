import type { FiveElement } from "./elements";

// 천간 10 → 오행
export const STEM_ELEMENT: Record<string, FiveElement> = {
  갑: "목", 을: "목", 병: "화", 정: "화", 무: "토",
  기: "토", 경: "금", 신: "금", 임: "수", 계: "수",
};

// 천간 10 → 양(true)/음(false)
export const STEM_YANG: Record<string, boolean> = {
  갑: true, 을: false, 병: true, 정: false, 무: true,
  기: false, 경: true, 신: false, 임: true, 계: false,
};

// 지지 12 → 오행
export const BRANCH_ELEMENT: Record<string, FiveElement> = {
  자: "수", 축: "토", 인: "목", 묘: "목", 진: "토", 사: "화",
  오: "화", 미: "토", 신: "금", 유: "금", 술: "토", 해: "수",
};

// 상생: key 가 value 를 생한다 (목생화 …)
const GENERATES: Record<FiveElement, FiveElement> = {
  목: "화", 화: "토", 토: "금", 금: "수", 수: "목",
};

// 상극: key 가 value 를 극한다 (목극토 …)
const CONTROLS: Record<FiveElement, FiveElement> = {
  목: "토", 토: "수", 수: "화", 화: "금", 금: "목",
};

export type ElementRelation = "비화" | "생아" | "아생" | "극아" | "아극";

/** self 기준으로 본 other 와의 오행 관계. */
export function elementRelation(self: FiveElement, other: FiveElement): ElementRelation {
  if (self === other) return "비화";
  if (GENERATES[other] === self) return "생아"; // other 가 self 를 생
  if (GENERATES[self] === other) return "아생"; // self 가 other 를 생
  if (CONTROLS[other] === self) return "극아"; // other 가 self 를 극
  if (CONTROLS[self] === other) return "아극"; // self 가 other 를 극
  throw new Error(`unreachable elementRelation: ${self} vs ${other}`);
}
