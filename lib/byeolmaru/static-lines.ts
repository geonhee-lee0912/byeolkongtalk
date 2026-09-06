// lib/byeolmaru/static-lines.ts — ⑥ 정적 콘텐츠 뱅크 조회(순수).
// 뱅크는 세션 내 저작 후 굳힌 JSON(변동비 0). 미스 시 null → 호출측이 폴백.
import cardLines from "@/data/byeolmaru/card-lines.json";
import skeletonLines from "@/data/byeolmaru/skeleton-lines.json";
import type { DayTone } from "./day-score.ts";
import type { ElementRelation } from "@/lib/saju/pairing";

type CardLine = { upright: string; reversed: string };
const CARD_LINES = cardLines as Record<string, CardLine>;
// ⑥ 조각 조합(C): relation 조각(결로 끝남) + tone 조언(오늘은 없이 시작)을 날짜 시드로 조합.
const SKELETON = skeletonLines as {
  relation: Record<string, string[]>;
  tone: Record<string, string[]>;
};

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
 * 나 캘린더 상세 골격 문장 — relation 조각 × tone 조언을 날짜 시드로 조합(조각 조합, ⑥-C).
 * `오늘은 {relation 조각}이라, {tone 조언}` 한 문장. 두 조각을 독립 인덱스로 뽑아 다양성↑
 * (relation 3 × tone 4 = 조합당 12출력). 같은 (tone, relation, date) 는 항상 같은 문장(결정론).
 * relation/tone 이 뱅크 밖이면 null(호출측이 문장 없이 등급+축만).
 */
export function getSkeletonLine(tone: DayTone, relation: ElementRelation, date: string): string | null {
  const relArr = SKELETON.relation[relation];
  const advArr = SKELETON.tone[tone];
  if (!relArr?.length || !advArr?.length) return null;
  const h = hashDate(date);
  const rel = relArr[h % relArr.length];
  // 정수 나눗셈으로 두 인덱스를 탈상관 — 같은 날 rel/adv 가 함께 굴러도 서로 다른 축으로 변한다.
  const adv = advArr[Math.floor(h / relArr.length) % advArr.length];
  return `오늘은 ${rel}이라, ${adv}`;
}
