import type { FiveElement } from "@/lib/saju/elements";

export type Pole = "양" | "음" | "강" | "유" | "재" | "인" | "생" | "단";
export type AxisKey = "yinYang" | "strength" | "wealth" | "nurture";

// 위치 가중치 (일간은 기준점 → 축 합산에서 제외 = 0)
export const POSITION_WEIGHT = {
  yearStem: 1.0,
  yearBranch: 1.0,
  monthStem: 1.2,
  monthBranch: 3.0,
  dayStem: 0,
  dayBranch: 1.5,
  hourStem: 1.0,
  hourBranch: 1.0,
} as const;

// 오행 주기질 산출 시 일간 가중(본인 핵심 → 일지와 동일 1.5). 축 합산엔 미적용.
export const DAY_STEM_ELEMENT_WEIGHT = 1.5;

// 생/단 이웃쌍 관계에서 일간 참여 가중(일주 비중)
export const DAY_STEM_PAIR_WEIGHT = 1.5;

// 지장간 본기 (지지 → 대표 천간). 정통 정기(正氣) 기준.
export const JANGAN_BONGI: Record<string, string> = {
  자: "계", 축: "기", 인: "갑", 묘: "을", 진: "무", 사: "병",
  오: "정", 미: "기", 신: "경", 유: "신", 술: "무", 해: "임",
};

// 천간·지지 정순 (표기상 음양 = index 짝수 → 양)
export const STEM_ORDER = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"];
export const BRANCH_ORDER = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];

// 오행 기질 음양 (목화 양 / 금수 음 / 토 중립)
export const ELEMENT_YINYANG: Record<FiveElement, number> = {
  목: 1, 화: 1, 토: 0, 금: -1, 수: -1,
};

// 합성 샘플 보정 산출물 (scripts/saju-mbti-calibrate.mjs, 1970-2010 매일 정오 ~15k건).
// 각 축: raw 오름차순 21분위점 [P0, P5, ..., P100]. 재생성 시 스크립트 재실행 후 교체.
export const QUANTILE_TABLE: Record<AxisKey, number[]> = {
  yinYang: [
    -6.3, -3.93, -3.03, -2.34, -1.74, -1.23, -0.68, -0.08, 0.52, 1.12, 1.72,
    2.32, 2.92, 3.54, 4.14, 4.68, 5.23, 5.8, 6.55, 7.39, 9.7,
  ],
  strength: [
    0, 7.6923, 7.6923, 15.3846, 16.9231, 20, 23.0769, 24.6154, 29.2308,
    35.3846, 36.9231, 43.0769, 47.6923, 49.2308, 55.3846, 60, 64.6154,
    67.6923, 75.3846, 83.0769, 100,
  ],
  wealth: [
    -9.7, -6.2, -5, -4.2, -3.5, -2.7, -2.3, -1.7, -1.3, -0.7, -0.2, 0.5, 1,
    1.7, 2.3, 2.7, 3.5, 4.3, 5.2, 6.5, 9.7,
  ],
  nurture: [
    -14.8, -6.85, -5.35, -4.3, -3.5, -2.8, -2.1, -1.5, -0.9, -0.4, 0.15, 0.7,
    1.2, 1.75, 2.35, 3.05, 3.8, 4.65, 5.7, 7.2, 14.8,
  ],
};
