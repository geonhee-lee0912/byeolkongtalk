// 별마루 하루 판정 — 순수. 내 사주(일간·일지·오행분포) × 그날 일진 → 점수·등급·3축.
// 🔴 룰 100% · LLM 0 → API 원가 0. 무료 티어가 이 파일 위에 서므로 여기에 네트워크·LLM 을 붙이지 말 것
//    (스펙 §5: 무료는 변동비 0인 것만). 가중치는 이 파일 상수가 정본이고 전부 튜닝 대상.
import {
  elementRelation,
  heavenlyCombo,
  earthlySixCombo,
  earthlySixClash,
  type ElementRelation,
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
  /** 내 일간 오행 기준 그날 천간 오행의 관계 */
  relation: ElementRelation;
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
    heavenlyCombo: heavenlyCombo(self.dayStem, day.stem),
    sixCombo: earthlySixCombo(self.dayBranch, day.branch),
    clash: earthlySixClash(self.dayBranch, day.branch),
    scarcity,
  };
}

// ── 가중치 (튜닝 대상) ─────────────────────────────────────
const BASE = 50;

const RELATION_W: Record<ElementRelation, number> = {
  생아: 18, // 그날이 나를 살려주는 결
  아극: 8, // 내가 다루는 결(재물)
  비화: 6, // 같은 결
  아생: -4, // 내가 내주는 결(소모)
  극아: -14, // 나를 누르는 결
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
      RELATION_W[f.relation] +
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
export function dayGrade(score: number): DayGrade {
  if (score >= 70) return { tone: "good", label: "잘 맞는 날" };
  if (score >= 45) return { tone: "normal", label: "무난한 날" };
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
