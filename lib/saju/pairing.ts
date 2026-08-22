import type { FiveElement } from "./elements";
import type { SajuResult } from "./calc";

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

export type TenGod =
  | "비견" | "겁재" | "식신" | "상관" | "편재"
  | "정재" | "편관" | "정관" | "편인" | "정인";

/** selfStem(일간) 기준으로 본 otherStem 의 십신. 방향성 있음. */
export function tenGod(selfStem: string, otherStem: string): TenGod {
  const rel = elementRelation(STEM_ELEMENT[selfStem], STEM_ELEMENT[otherStem]);
  const same = STEM_YANG[selfStem] === STEM_YANG[otherStem];
  switch (rel) {
    case "비화": return same ? "비견" : "겁재";
    case "아생": return same ? "식신" : "상관";
    case "아극": return same ? "편재" : "정재";
    case "극아": return same ? "편관" : "정관";
    case "생아": return same ? "편인" : "정인";
  }
}

// 별콩 톤 라벨 — 십신 한자명의 민간 낙인(편관=칠살 등) 제거. 카피 검토 대상.
export const TEN_GOD_LABEL: Record<TenGod, string> = {
  비견: "나란히 걷는 친구",
  겁재: "티격태격 짝꿍",
  식신: "내가 챙겨주는 사람",
  상관: "내 끼를 끌어내는 사람",
  편재: "내가 이끄는 사람",
  정재: "내가 아끼는 사람",
  편관: "날 긴장시키는 사람",
  정관: "든든한 지원군",
  편인: "날 북돋는 사람",
  정인: "날 감싸주는 사람",
};

// 천간합 5쌍 — 양방향 문자열로 저장(한글 정렬 회피)
const HEAVENLY_COMBO_SET = new Set(
  [["갑","기"],["을","경"],["병","신"],["정","임"],["무","계"]]
    .flatMap(([a, b]) => [a + b, b + a])
);

/** 두 일간이 천간합(끌림)인가. */
export function heavenlyCombo(stemA: string, stemB: string): boolean {
  return HEAVENLY_COMBO_SET.has(stemA + stemB);
}

// 지지 육합 6쌍
const SIX_COMBO_SET = new Set(
  [["자","축"],["인","해"],["묘","술"],["진","유"],["사","신"],["오","미"]]
    .flatMap(([a, b]) => [a + b, b + a])
);

/** 두 일지가 육합(결속)인가. */
export function earthlySixCombo(branchA: string, branchB: string): boolean {
  return SIX_COMBO_SET.has(branchA + branchB);
}

// 삼합 4그룹 — 지지 3종이 모두 있으면 해당 오행 국(局) 완성
const TRIAD_GROUPS: { branches: [string, string, string]; element: FiveElement }[] = [
  { branches: ["신", "자", "진"], element: "수" },
  { branches: ["해", "묘", "미"], element: "목" },
  { branches: ["인", "오", "술"], element: "화" },
  { branches: ["사", "유", "축"], element: "금" },
];

export interface Triad {
  branches: [string, string, string];
  element: FiveElement;
}

/** 일지 집합에서 완성된 삼합 그룹을 모두 반환(존재 여부 기준, 순서·중복 무관). */
export function findTriads(branches: string[]): Triad[] {
  const present = new Set(branches);
  return TRIAD_GROUPS
    .filter((g) => g.branches.every((b) => present.has(b)))
    .map((g) => ({ branches: [...g.branches] as [string, string, string], element: g.element }));
}

export interface PairRelation {
  element: ElementRelation; // a 기준 오행 관계
  tenGodAtoB: TenGod; // a→b 십신
  tenGodBtoA: TenGod; // b→a 십신 (방향성)
  labelAtoB: string; // 별콩 라벨 (a→b)
  labelBtoA: string; // 별콩 라벨 (b→a)
  heavenlyCombo: boolean; // 천간합(케미 스파크) — 일간
  sixCombo: boolean; // 육합(결속선) — 일지
  // 연·월 기둥의 조화 수(연간·월간 천간합 + 연지·월지 육합, 0~4). 일주 지표의 보조 신호(동점 완화).
  // 시주는 제외(생시 없으면 불공정) — 날짜만으로 나오는 연·월만.
  extraPillarHarmony: number;
}

/** 두 사람의 사주로 관계 지표를 종합. a 를 "나" 기준으로 본다. */
export function pairRelation(a: SajuResult, b: SajuResult): PairRelation {
  const aToB = tenGod(a.dayStem, b.dayStem);
  const bToA = tenGod(b.dayStem, a.dayStem);
  const extraPillarHarmony =
    (heavenlyCombo(a.pillars.year.stem, b.pillars.year.stem) ? 1 : 0) +
    (heavenlyCombo(a.pillars.month.stem, b.pillars.month.stem) ? 1 : 0) +
    (earthlySixCombo(a.pillars.year.branch, b.pillars.year.branch) ? 1 : 0) +
    (earthlySixCombo(a.pillars.month.branch, b.pillars.month.branch) ? 1 : 0);
  return {
    element: elementRelation(a.dayElement, b.dayElement),
    tenGodAtoB: aToB,
    tenGodBtoA: bToA,
    labelAtoB: TEN_GOD_LABEL[aToB],
    labelBtoA: TEN_GOD_LABEL[bToA],
    heavenlyCombo: heavenlyCombo(a.dayStem, b.dayStem),
    sixCombo: earthlySixCombo(a.pillars.day.branch, b.pillars.day.branch),
    extraPillarHarmony,
  };
}
