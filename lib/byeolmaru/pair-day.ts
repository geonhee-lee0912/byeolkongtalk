// lib/byeolmaru/pair-day.ts — 우리 오늘 판정(C 하이브리드). 순수·룰100%·LLM0.
// 나(A) × 상대(B) × 그날 일진 → 우리 셀(tone/score/tags) + "너희 결" 고정 배경.
// 🔴 가중치는 이 파일 상수가 정본·전부 튜닝 대상(day-score.ts 와 같은 규율).
import type { DailyLuck, SajuResult } from "@/lib/saju/calc";
import { pairRelation, heavenlyCombo, earthlySixCombo, earthlySixClash } from "@/lib/saju/pairing";
import { dayFactors, dayScore } from "./day-score.ts";
import { toDaySelf } from "./calendar.ts";

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
