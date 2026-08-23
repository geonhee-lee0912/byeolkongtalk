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
