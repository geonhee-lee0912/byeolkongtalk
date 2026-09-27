// 별마루 하루 판정 — 순수. 내 사주(일간·일지·오행분포) × 그날 일진 → 점수·등급·3축.
// 🔴 룰 100% · LLM 0 → API 원가 0. 무료 티어가 이 파일 위에 서므로 여기에 네트워크·LLM 을 붙이지 말 것
//    (스펙 §5: 무료는 변동비 0인 것만). 가중치는 이 파일 상수가 정본이고 전부 튜닝 대상.
import {
  elementRelation,
  heavenlyCombo,
  earthlySixCombo,
  earthlySixClash,
  tenGod,
  BRANCH_ELEMENT,
  type ElementRelation,
  type TenGod,
} from "@/lib/saju/pairing";
import type { FiveElement } from "@/lib/saju/elements";

export interface DaySelf {
  /** 내 일간 (한글 "갑") */
  dayStem: string;
  /** 내 일지 (한글 "자") */
  dayBranch: string;
  dayElement: FiveElement;
  /** 내 사주 오행 분포 (총합 8) */
  elementCount: Record<FiveElement, number>;
}

export interface DayLuck {
  stem: string;
  branch: string;
  element: FiveElement;
}

/** 내 사주에서 그날 오행이 얼마나 있는가 — 없으면 보충(가점), 과하면 가중(감점). */
export type Scarcity = "absent" | "scarce" | "balanced" | "excess";

export interface DayFactors {
  /** 내 일간 오행 기준 그날 천간 오행의 관계. 🔴 **점수에는 더 이상 안 쓴다**(tenGod 이 대신한다) —
   *  화면·골격 뱅크 키로는 계속 쓰이므로 남긴다(DayCell.relation · static-lines 의 SKELETON). */
  relation: ElementRelation;
  /** 내 일간 기준 그날 천간의 십신 10종. relation(5종)을 음양까지 갈라 본 것. */
  tenGod: TenGod;
  /** 내 일지 오행 기준 그날 지지 오행의 관계 — 천간 축과 **독립**이라 조합이 곱해진다. */
  branchRelation: ElementRelation;
  heavenlyCombo: boolean;
  sixCombo: boolean;
  clash: boolean;
  scarcity: Scarcity;
}

/** 내 사주 × 그날 일진 → 판정 재료. ③ 우리 오늘도 이 함수를 재사용한다. */
export function dayFactors(self: DaySelf, day: DayLuck): DayFactors {
  // saju_data 는 JSONB — calcSaju 는 항상 5키를 채우지만 스키마가 런타임에 강제되지 않아 방어로 남긴다.
  // 가드가 없으면 키 누락이 crash 가 아니라 balanced 오분류로 조용히 샌다.
  const n = self.elementCount[day.element] ?? 0;
  const scarcity: Scarcity =
    n === 0 ? "absent" : n === 1 ? "scarce" : n >= 3 ? "excess" : "balanced";
  return {
    relation: elementRelation(self.dayElement, day.element),
    tenGod: tenGod(self.dayStem, day.stem),
    // 지지 오행이 매핑에 없는 값이면(한자 유입 등) 비화로 떨어뜨린다 — 점수 가산 0 인 중립값이라
    // 조용히 유리/불리해지지 않는다. elementRelation 에 undefined 를 먹이면 "비화"가 아니라
    // "아생"이 나와(둘 다 undefined 비교 실패) 한쪽으로 기울었을 것.
    branchRelation:
      BRANCH_ELEMENT[self.dayBranch] && BRANCH_ELEMENT[day.branch]
        ? elementRelation(BRANCH_ELEMENT[self.dayBranch], BRANCH_ELEMENT[day.branch])
        : "비화",
    heavenlyCombo: heavenlyCombo(self.dayStem, day.stem),
    sixCombo: earthlySixCombo(self.dayBranch, day.branch),
    clash: earthlySixClash(self.dayBranch, day.branch),
    scarcity,
  };
}

// ── 가중치 (튜닝 대상) ─────────────────────────────────────
const BASE = 50;

/** 🔴 2026-09-27 — RELATION_W(5종)를 대체한다. 같은 오행 관계 안에서 **음양으로 갈라** 10종.
 *  괄호 안은 옛 RELATION_W 값이고, 각 쌍의 평균이 그 값과 같도록 ±3 씩 벌렸다(전체 난이도 불변).
 *  순서는 통설을 따른다 — 정(正)이 편(偏)보다 순하고, 식신이 상관보다 온화하다. */
const TEN_GOD_W: Record<TenGod, number> = {
  정인: 21, 편인: 15, // 생아 (18) — 나를 살려주는 결
  정재: 11, 편재: 5, //  아극 (8)  — 내가 다루는 결(재물)
  비견: 9, 겁재: 3, //   비화 (6)  — 같은 결
  식신: -1, 상관: -7, // 아생 (-4) — 내가 내주는 결(소모)
  정관: -11, 편관: -17, // 극아 (-14) — 나를 누르는 결
};
/** 🔴 2026-09-27 신설 — **천간 축과 독립인 두 번째 축**. 이게 다양성의 본체다(30칸 고유 점수
 *  10종 → 25종). 천간 가중치의 약 40% 스케일이라 등급을 뒤집기보단 같은 등급 안에서 흔든다.
 *  그 전까지 일지는 육합·충이 걸리는 드문 날에만 쓰여서 대부분의 날 점수에 영향이 0이었다. */
const BRANCH_REL_W: Record<ElementRelation, number> = {
  생아: 7, 아극: 3, 비화: 2, 아생: -2, 극아: -6,
};
const HEAVENLY_W = 14;
const SIX_COMBO_W = 10;
const CLASH_W = -16;
const SCARCITY_W: Record<Scarcity, number> = {
  absent: 10,
  scarce: 5,
  balanced: 0,
  excess: -8,
};

// 축별 relation 가중치 — dayScore 의 RELATION_W 와 마찬가지로 Record<ElementRelation, number> 로
// 강제한다. 삼항연산 체인이었다면 컴파일러가 놓쳐, 새 ElementRelation 멤버가 추가돼도 세 축
// 모두 조용히 0점 처리된 채 빌드가 통과했을 것(리뷰에서 실측 확인) — Record 는 새 멤버가 생기면
// 여기 채워 넣기 전까지 빌드를 깨뜨린다.
const LOVE_RELATION_W: Record<ElementRelation, number> = { 생아: 10, 극아: -12, 비화: 4, 아극: 0, 아생: 0 };
const MONEY_RELATION_W: Record<ElementRelation, number> = { 아극: 18, 생아: 8, 아생: -10, 극아: 0, 비화: 0 };
const WORK_RELATION_W: Record<ElementRelation, number> = { 생아: 15, 비화: 8, 극아: -10, 아극: 0, 아생: 0 };

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** 전반 점수 0~100 (정수). */
export function dayScore(f: DayFactors): number {
  return clamp(
    BASE +
      TEN_GOD_W[f.tenGod] +
      BRANCH_REL_W[f.branchRelation] +
      (f.heavenlyCombo ? HEAVENLY_W : 0) +
      (f.sixCombo ? SIX_COMBO_W : 0) +
      (f.clash ? CLASH_W : 0) +
      SCARCITY_W[f.scarcity]
  );
}

export type DayTone = "good" | "normal" | "caution";
export interface DayGrade {
  tone: DayTone;
  label: string;
}

/** 점수 → 등급. 라벨은 단정 금지(페르소나 화법) — "좋다/나쁘다"가 아니라 결의 이름. */
/**
 * 🔴 임계 71/44 는 임의의 숫자가 아니다 — **화면에 찍히는 숫자(백분위)의 80/20 과 같은
 *    자리**다(2026-09-27). 45/70 이던 시절엔 칸의 숫자(백분위)와 칸의 색·라벨(원점수)이 다른
 *    축이라, 화면에 70 이 찍힌 날이 금색이 아니고 25 가 찍힌 날이 보라인 칸이 30칸 중 11칸
 *    나왔다(실물 지적). 백분위가 단조 증가하고 SCORE_PERCENTILE_ANCHORS 에 46·68 이 그대로
 *    있어 이 두 값에서 **정확히** 맞아떨어진다(43→19점 · 70→78점으로 경계 밖).
 *    🔴 2026-09-27 점수 모델 확장(십신·일지)으로 분포가 바뀌어 68/46 → 71/44 로 재산출했다.
 *    표본은 **완전 교차 1,782,000칸**(60갑자 일주 × 60갑자 일진 × 합이 8인 오행분포 495종).
 * 🔴 이 숫자를 옮기면 calendar-visual.test.ts 의 "축 정렬" 계약이 깨진다. 깨지면 테스트를
 *    고치지 말고 **앵커와 임계를 다시 같은 자리로 맞출 것** — 어긋난 채 두면 화면에서만 보인다.
 */
export function dayGrade(score: number): DayGrade {
  if (score >= 71) return { tone: "good", label: "잘 맞는 날" };
  if (score >= 44) return { tone: "normal", label: "무난한 날" };
  return { tone: "caution", label: "살짝 챙길 날" };
}

export interface AxisScores {
  love: number;
  money: number;
  work: number;
}

/** 같은 재료를 축마다 다른 무게로 본다. 실수요가 연애 96.7%라 love 가 주력 축. */
export function axisScores(f: DayFactors): AxisScores {
  const love = clamp(
    BASE +
      (f.heavenlyCombo ? 25 : 0) +
      (f.sixCombo ? 18 : 0) +
      (f.clash ? -20 : 0) +
      LOVE_RELATION_W[f.relation]
  );
  const money = clamp(
    BASE +
      MONEY_RELATION_W[f.relation] +
      SCARCITY_W[f.scarcity] +
      (f.clash ? -10 : 0)
  );
  const work = clamp(
    BASE +
      WORK_RELATION_W[f.relation] +
      (f.sixCombo ? 8 : 0) +
      (f.clash ? -12 : 0) +
      SCARCITY_W[f.scarcity]
  );
  return { love, money, work };
}
