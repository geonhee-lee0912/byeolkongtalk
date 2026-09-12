// lib/byeolmaru/pair-day.ts — 우리 오늘 판정(C 하이브리드). 순수·룰100%·LLM0.
// 나(A) × 상대(B) × 그날 일진 → 우리 셀(tone/score/tags) + "너희 결" 고정 배경.
// 🔴 가중치는 이 파일 상수가 정본·전부 튜닝 대상(day-score.ts 와 같은 규율).
import type { DailyLuck, SajuResult } from "@/lib/saju/calc";
import { pairRelation, heavenlyCombo, earthlySixCombo, earthlySixClash } from "@/lib/saju/pairing";
import { dayFactors, dayScore } from "./day-score.ts";
import { toDaySelf } from "./calendar.ts";
import type { RelationshipStatus } from "@/lib/relationship/types";

export type PairTone = "good" | "normal" | "caution";

export interface PairDayTags {
  spark: boolean;
  bond: boolean;
  friction: boolean;
  lead: "me" | "partner" | null;
}

export interface PairDayCell {
  date: string;
  ganji: string;
  score: number;
  tone: PairTone;
  tags: PairDayTags;
  isToday: boolean;
}

export interface PairBackdrop {
  labelAtoB: string;
  labelBtoA: string;
  spark: boolean;
  bond: boolean;
  harmony: number;
}

const LEAD_THRESHOLD = 8;
const SPARK_W = 12;
const BOND_W = 9;
const FRICTION_W = -14;
const BASELINE_SPARK_W = 4;
const BASELINE_BOND_W = 4;
const BASELINE_HARMONY_W = 2;

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function pairBackdrop(a: SajuResult, b: SajuResult): PairBackdrop {
  const pr = pairRelation(a, b);
  return {
    labelAtoB: pr.labelAtoB,
    labelBtoA: pr.labelBtoA,
    spark: pr.heavenlyCombo,
    bond: pr.sixCombo,
    harmony: pr.extraPillarHarmony,
  };
}

export function pairDayTone(score: number): PairTone {
  if (score >= 70) return "good";
  if (score >= 45) return "normal";
  return "caution";
}

/** tone → 표시 라벨. dayGrade() 라벨과 동일 문구(무회귀). */
export const PAIR_TONE_LABEL: Record<PairTone, string> = {
  good: "잘 맞는 날",
  normal: "무난한 날",
  caution: "살짝 챙길 날",
};

function pairDayScoreAndTags(a: SajuResult, b: SajuResult, d: DailyLuck, backdrop: PairBackdrop) {
  const dl = { stem: d.stem, branch: d.branch, element: d.element };
  const scoreA = dayScore(dayFactors(toDaySelf(a), dl));
  const scoreB = dayScore(dayFactors(toDaySelf(b), dl));

  const base = (scoreA + scoreB) / 2;

  const spark = heavenlyCombo(d.stem, a.dayStem) || heavenlyCombo(d.stem, b.dayStem);
  const bond = earthlySixCombo(d.branch, a.pillars.day.branch) || earthlySixCombo(d.branch, b.pillars.day.branch);
  const friction = earthlySixClash(d.branch, a.pillars.day.branch) || earthlySixClash(d.branch, b.pillars.day.branch);

  const baseline =
    (backdrop.spark ? BASELINE_SPARK_W : 0) +
    (backdrop.bond ? BASELINE_BOND_W : 0) +
    backdrop.harmony * BASELINE_HARMONY_W;

  const score = clamp(base + (spark ? SPARK_W : 0) + (bond ? BOND_W : 0) + (friction ? FRICTION_W : 0) + baseline);
  const lead: PairDayTags["lead"] =
    Math.abs(scoreA - scoreB) >= LEAD_THRESHOLD ? (scoreA > scoreB ? "me" : "partner") : null;

  return { score, tags: { spark, bond, friction, lead } as PairDayTags };
}

export function buildPairCalendar(a: SajuResult, b: SajuResult, dailyLuck: DailyLuck[], todayKst: string): PairDayCell[] {
  const backdrop = pairBackdrop(a, b);
  return dailyLuck.map((d) => {
    const { score, tags } = pairDayScoreAndTags(a, b, d, backdrop);
    return { date: d.date, ganji: d.stem + d.branch, score, tone: pairDayTone(score), tags, isToday: d.date === todayKst };
  });
}

/** status별 관계 프레이밍 — 기존 톤 문구 앞에 가볍게 얹는다(문구만, score/tags 무관). */
const STATUS_FRAME: Record<RelationshipStatus, string> = {
  onesided: "짝사랑이라 마음이 더 쓰이지만, ",
  crush: "썸이라 설레는 만큼, ",
  dating: "연애 중인 오늘은, ",
  breakup: "지난 사이라도, ",
};

/** 무료 우리 오늘 정적 한 줄 — 오늘 톤/태그로 룰 조합(LLM 0). 구독 LLM 서술의 자리를 무료로 메운다.
 * status(썸/연애/짝사랑/헤어진)가 있으면 관계 프레이밍을 앞에 얹는다 — null(미지정)이면 기존 톤 문구 그대로. */
export function getPairStaticLine(cell: PairDayCell, status?: RelationshipStatus | null): string {
  const t = cell.tags;
  const line = (() => {
    if (t.friction) return "오늘은 둘 사이 결이 살짝 엇갈릴 수 있어. 말 한마디를 천천히 골라보면 좋아.";
    if (t.spark && t.bond) return "오늘은 끌림도 결속도 같이 도는 날이야. 마음이 자연스럽게 가까워져.";
    if (t.spark) return "오늘은 둘 사이에 끌림이 도는 날이야. 작은 신호에 마음이 움직여.";
    if (t.bond) return "오늘은 서로 편안하게 이어지는 결이야. 함께 있는 시간이 순해.";
    if (cell.tone === "good") return "오늘은 둘 사이 흐름이 순한 날이야.";
    if (cell.tone === "caution") return "오늘은 서로 조금 챙겨주면 좋은 결이야.";
    return "오늘은 둘 사이 무난하게 흐르는 날이야.";
  })();
  return status ? STATUS_FRAME[status] + line : line;
}
