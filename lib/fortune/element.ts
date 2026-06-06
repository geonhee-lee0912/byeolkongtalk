// 오행(FiveElement) 관련 공유 상수·헬퍼 — daily / monthly 리포트 양쪽에서 사용.
// 원래 daily-report.ts 에 있던 것을 추출. daily-report.ts 는 ELEMENT_COLOR 를 re-export 해 기존 사용처 호환.

import type { FiveElement } from "manseryeok";

/** 오행 → 색 (간지 글자 점 색). 브랜드 톤 고정. */
export const ELEMENT_COLOR: Record<FiveElement, string> = {
  목: "#5FA36A",
  화: "#D9694C",
  토: "#C99A4E",
  금: "#8E8E93",
  수: "#5B86C9",
};

// 천간(한글) → 오행. PillarLite.stem 은 한글("갑").
export const STEM_ELEMENT: Record<string, FiveElement> = {
  갑: "목", 을: "목", 병: "화", 정: "화", 무: "토",
  기: "토", 경: "금", 신: "금", 임: "수", 계: "수",
};

// 지지(한글) → 오행. PillarLite.branch 는 한글("자").
export const BRANCH_ELEMENT: Record<string, FiveElement> = {
  자: "수", 축: "토", 인: "목", 묘: "목", 진: "토", 사: "화",
  오: "화", 미: "토", 신: "금", 유: "금", 술: "토", 해: "수",
};

/** 천간 한글 → 오행 (모르면 fallback). */
export function stemToElement(stem: string, fallback: FiveElement): FiveElement {
  return STEM_ELEMENT[stem] ?? fallback;
}

/** 지지 한글 → 오행 (모르면 fallback). */
export function branchToElement(branch: string, fallback: FiveElement): FiveElement {
  return BRANCH_ELEMENT[branch] ?? fallback;
}
