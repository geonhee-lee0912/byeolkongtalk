// lib/byeolmaru/static-lines.ts — ⑥ 정적 콘텐츠 뱅크 조회(순수).
// 뱅크는 세션 내 저작 후 굳힌 JSON(변동비 0). 미스 시 null → 호출측이 폴백.
import cardLines from "@/data/byeolmaru/card-lines.json";
import skeletonLines from "@/data/byeolmaru/skeleton-lines.json";
import type { DayTone } from "./day-score.ts";
import type { ElementRelation } from "@/lib/saju/pairing";

type CardLine = { upright: string; reversed: string };
const CARD_LINES = cardLines as Record<string, CardLine>;
const SKELETON_LINES = skeletonLines as Record<string, Record<string, string[]>>;

/** 오늘의 카드 정적 해석 — 카드 id(0~77) × 정/역. 뱅크 미스면 null(호출측 키워드 템플릿 폴백). */
export function getCardLine(cardId: number, reversed: boolean): string | null {
  const e = CARD_LINES[String(cardId)];
  if (!e) return null;
  return reversed ? e.reversed : e.upright;
}

/** 날짜 문자열 → 결정론적 해시(같은 날은 늘 같은 값). variant 로테이션에만 쓴다. */
function hashDate(date: string): number {
  let h = 0;
  for (let i = 0; i < date.length; i++) h = (h * 31 + date.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * 나 캘린더 상세 골격 문장 — 등급 tone × relation 조합의 variant 를 날짜로 로테이션.
 * 같은 (tone, relation, date) 는 항상 같은 문장(결정론). 뱅크 미스면 null(호출측이 문장 없이 등급+축만).
 */
export function getSkeletonLine(tone: DayTone, relation: ElementRelation, date: string): string | null {
  const arr = SKELETON_LINES[tone]?.[relation];
  if (!arr || arr.length === 0) return null;
  return arr[hashDate(date) % arr.length];
}
