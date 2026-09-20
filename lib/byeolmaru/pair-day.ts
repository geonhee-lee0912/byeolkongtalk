// lib/byeolmaru/pair-day.ts — 우리 오늘 판정(C 하이브리드). 순수·룰100%·LLM0.
// 나(A) × 상대(B) × 그날 일진 → 우리 셀(tone/score/tags) + "너희 결" 고정 배경.
// 🔴 가중치는 이 파일 상수가 정본·전부 튜닝 대상(day-score.ts 와 같은 규율).
import type { DailyLuck, SajuResult } from "@/lib/saju/calc";
import { pairRelation, heavenlyCombo, earthlySixCombo, earthlySixClash } from "@/lib/saju/pairing";
import { dayFactors, dayScore } from "./day-score.ts";
import { toDaySelf } from "./calendar.ts";
import type { DayMark } from "./day-label.ts";

export type PairTone = "good" | "normal" | "caution";

export interface PairDayTags {
  /** 둘 중 **한 명이라도** 걸렸나 — 표시·서술이 쓰는 값(narrative-prompt·static-lines 무회귀). */
  spark: boolean;
  /** 둘 **다** 걸렸나 — 점수 가중과 마크 강도가 쓰는 값(스펙 §3-1-a). */
  sparkBoth: boolean;
  bond: boolean;
  bondBoth: boolean;
  friction: boolean;
  frictionBoth: boolean;
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
// 🔴 baseline(쌍 고정 가산)은 2026-09-20 실측으로 **점수에서 제거**됐다(스펙 §3-1-a).
//    쌍의 76%가 +0 이라 레벨 요인이 아니었고, 남기면 궁합 좋은 쌍만 달 전체가 들려 금색 꼬리를 만든다.
//    궁합은 pairBackdrop 으로 계속 나가고 **배경 설명**이 그걸 말한다 — 점수엔 안 들어간다.

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

function pairDayScoreAndTags(a: SajuResult, b: SajuResult, d: DailyLuck) {
  const dl = { stem: d.stem, branch: d.branch, element: d.element };
  const scoreA = dayScore(dayFactors(toDaySelf(a), dl));
  const scoreB = dayScore(dayFactors(toDaySelf(b), dl));
  const base = (scoreA + scoreB) / 2;

  // 🔴 OR 이 아니라 **머릿수**를 센다. OR 이면 한 명만 걸린 날(발화 칸의 95%)이 둘 다인 날과 똑같이
  //    만점을 받아, 1인용 임계(70)에 2배 확률의 가산점을 얹는 꼴이었다(실측 1.91×·1.92×).
  const sparkN = (heavenlyCombo(d.stem, a.dayStem) ? 1 : 0) + (heavenlyCombo(d.stem, b.dayStem) ? 1 : 0);
  const bondN = (earthlySixCombo(d.branch, a.pillars.day.branch) ? 1 : 0) + (earthlySixCombo(d.branch, b.pillars.day.branch) ? 1 : 0);
  // 삐걱은 OR 그대로 — 한 명만 충이어도 그날 조심할 이유는 실재하고, 가중하면 "챙길 날"만
  // 18.9%→15.4% 로 희석된다(금색 과다와 무관한 부작용).
  const frictionN = (earthlySixClash(d.branch, a.pillars.day.branch) ? 1 : 0) + (earthlySixClash(d.branch, b.pillars.day.branch) ? 1 : 0);

  const score = clamp(base + SPARK_W * (sparkN / 2) + BOND_W * (bondN / 2) + (frictionN > 0 ? FRICTION_W : 0));
  const lead: PairDayTags["lead"] =
    Math.abs(scoreA - scoreB) >= LEAD_THRESHOLD ? (scoreA > scoreB ? "me" : "partner") : null;

  return {
    score,
    tags: {
      spark: sparkN > 0, sparkBoth: sparkN === 2,
      bond: bondN > 0, bondBoth: bondN === 2,
      friction: frictionN > 0, frictionBoth: frictionN === 2,
      lead,
    } satisfies PairDayTags,
  };
}

export function buildPairCalendar(a: SajuResult, b: SajuResult, dailyLuck: DailyLuck[], todayKst: string): PairDayCell[] {
  return dailyLuck.map((d) => {
    const { score, tags } = pairDayScoreAndTags(a, b, d);
    return { date: d.date, ganji: d.stem + d.branch, score, tone: pairDayTone(score), tags, isToday: d.date === todayKst };
  });
}

/** 우리 셀 마크 — 나 탭(`dayMarks`)과 **같은 글리프 문법**을 쓴다. 판정 primitive 가 실제로 같기
 *  때문이다(끌림=천간합 ✧ · 결속=육합 ◇ · 삐걱=충 △ — 위 pairDayScoreAndTags 를 보라).
 *  🔴 이모지(✨🔗)를 쓰지 않는다: 셀 글리프는 8px 라 이모지 형태가 뭉개지고, 고유색이 좋은 날의
 *     골드 배경과 부딪힌다. 스펙 §8 의 `✨끌림 🔗결속` 은 **어휘** 지정이지 글리프 지정이 아니다.
 *  🔴 lead 는 마크가 아니다 — 두 사람 점수 차이라 "그날의 원인"이 아니고, 셀은 마크를 1개만
 *     그리므로(겹침 실측) 리드가 끌림을 밀어낸다. 리드는 상세 카드 칩으로만 남는다. */
export function pairMarks(tags: PairDayTags): DayMark[] {
  const out: DayMark[] = [];
  // 강도 = 점수 가중과 같은 규칙(둘 다 full · 한 명 half). 실측상 "둘 다"는 발화 칸의 5% 뿐이라,
  // 둘 다일 때만 마크를 띄우면 30일에 0.3번이라 사실상 마크 폐지가 된다 — 그래서 끄지 않고 연하게 쓴다.
  if (tags.spark) out.push({ glyph: "✧", label: "끌림", strength: tags.sparkBoth ? "full" : "half" });
  if (tags.bond) out.push({ glyph: "◇", label: "결속", strength: tags.bondBoth ? "full" : "half" });
  if (tags.friction) out.push({ glyph: "△", label: "삐걱", strength: tags.frictionBoth ? "full" : "half" });
  return out;
}
