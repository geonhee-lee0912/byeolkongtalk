// lib/byeolmaru/static-lines.ts — ⑥ 정적 콘텐츠 뱅크 조회(순수).
// 뱅크는 세션 내 저작 후 굳힌 JSON(변동비 0). 미스 시 null → 호출측이 폴백.
import cardLines from "@/data/byeolmaru/card-lines.json";
import cardTaste from "@/data/byeolmaru/card-taste.json";
import skeletonLines from "@/data/byeolmaru/skeleton-lines.json";
import sajuTaste from "@/data/byeolmaru/saju-taste.json";
import type { DayTone, AxisScores } from "./day-score.ts";
import type { ElementRelation } from "@/lib/saju/pairing";

type CardLine = { upright: string; reversed: string };
const CARD_LINES = cardLines as Record<string, CardLine>;
// ⑥/1C 무료 오늘 타로 taste — 카드 id×정역 각 ~350자 본문(별콩 톤, 비개인화). 구조는 card-taste.json.
// 인사말은 본문에서 분리해 getCardTaste 에서 날짜 시드로 붙인다(아래 CARD_TASTE_GREETINGS 주석 참조).
const CARD_TASTE = cardTaste as Record<string, CardLine>;
// ⑥ 조각 조합(C): relation 조각(결로 끝남) + tone 조언(오늘은 없이 시작)을 날짜 시드로 조합.
const SKELETON = skeletonLines as {
  relation: Record<string, string[]>;
  tone: Record<string, string[]>;
};
type TasteBand = "high" | "mid" | "low";
// ⑥ 무료 오늘 사주 taste 뱅크(전반+연애+일·돈+조언) — 구조는 data/byeolmaru/saju-taste.json 참조.
// day-score.ts:77 처럼 유니온 Record 로 강제한다 — 새 tone/band/relation 이 생기면 JSON 키를
// 채우기 전까지 tsc 가 깨진다(Record<string> 이면 키 오타가 조용히 "" 로 샜을 것).
const TASTE = sajuTaste as {
  overall: Record<DayTone, string[]>;
  love: Record<TasteBand, string[]>;
  work: Record<TasteBand, string[]>;
  money: Record<TasteBand, string[]>;
  advice: Record<ElementRelation, string[]>;
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
 * ⚠️ 1C-사주-무료(2026-09-07)부터 DayDetailCard 는 getSajuTaste 를 쓴다 — 이 함수는 현재 앱에서
 *    미사용이나, skeleton-lines.json 이 후속 타로 뱅크의 재사용 자산이라 테스트와 함께 남겨둔다.
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

// 밴드 임계 65/45 는 dayGrade 의 70/45 와 의도적으로 다르다(등급=전반 판정, taste 밴드=축별 강조).
function tasteBand(score: number): TasteBand {
  return score >= 65 ? "high" : score >= 45 ? "mid" : "low";
}

export interface SajuTaste {
  overall: string;
  love: string;
  work: string;
  money: string;
  advice: string;
}

// 32비트 avalanche 믹스 — hashDate 는 "YYYY-MM-DD" 라 하루에 대개 +1 씩만 늘어(자릿수 고정).
// floor(h/salt)%len 로 뽑으면 슬롯 인덱스가 salt 일 동안 고정돼 같은 문장이 1~2주 반복됐다(리뷰
// 실측 money 91%·advice 89% 하루-대-하루 반복). 슬롯마다 base 를 avalanche 로 흩뿌려 날짜·슬롯을
// 모두 탈상관시킨다(검증 = static-lines.test.ts 의 30일 다양성 테스트).
function mix32(n: number): number {
  n = (n ^ (n >>> 15)) >>> 0;
  n = Math.imul(n, 0x2c1b3c6d) >>> 0;
  n = (n ^ (n >>> 12)) >>> 0;
  n = Math.imul(n, 0x297a2d39) >>> 0;
  n = (n ^ (n >>> 15)) >>> 0;
  return n;
}

/** 무료 오늘 사주 taste — 등급 tone·축 밴드(상≥65·중45~64·하<45)·관계로 조각을 날짜 시드로 조합.
 * 룰 100%·₩0. 각 슬롯 미스면 그 조각만 ""(호출측이 빈 조각 렌더 생략). */
export function getSajuTaste(
  tone: DayTone,
  axes: AxisScores,
  relation: ElementRelation,
  date: string
): SajuTaste {
  const base = hashDate(date);
  // 슬롯 인덱스마다 avalanche 로 독립 시드 — 같은 날 조각끼리도, 날짜가 넘어가도 탈상관.
  const pick = (arr: string[] | undefined, slot: number): string =>
    arr && arr.length ? arr[mix32(base * 31 + slot) % arr.length] : "";
  return {
    overall: pick(TASTE.overall[tone], 0),
    love: pick(TASTE.love[tasteBand(axes.love)], 1),
    work: pick(TASTE.work[tasteBand(axes.work)], 2),
    money: pick(TASTE.money[tasteBand(axes.money)], 3),
    advice: pick(TASTE.advice[relation], 4),
  };
}

// 오늘의 카드 taste 인사말 뱅크 — 본문(카드별 고정 프리즈)과 분리한 룰 로테이션.
// 데일리라 인사말을 본문에 굳히면 매일 같은 "안녕…"이 보였다(사용자 피드백 2026-09-12) →
// 날짜 시드로 매일 다른 인사를 앞에 붙여 신선함만 준다. 본문은 그대로 재사용(변동비 0).
const CARD_TASTE_GREETINGS = [
  "안녕, 나 별콩이야.",
  "반가워, 별콩이 왔어.",
  "어서 와, 오늘도 별콩이야.",
  "안녕, 별콩이 여기 있지.",
  "살며시, 별콩이가 곁에 왔어.",
  "반가워, 나 별콩이야.",
  "별콩이가 조용히 다가왔어.",
  "안녕, 잘 지냈어? 별콩이야.",
];

/** 무료 오늘의 카드 taste — 카드 id(0~77)×정역 각 ~350자 본문 + 날짜별 인사말(맨 앞).
 * 본문은 프리즈 뱅크(룰·₩0), 인사말만 날짜 시드로 로테이션. 뱅크 미스면 null(호출측 키워드 폴백). */
export function getCardTaste(cardId: number, reversed: boolean, date: string): string | null {
  const e = CARD_TASTE[String(cardId)];
  if (!e) return null;
  const body = reversed ? e.reversed : e.upright;
  if (!body) return null;
  const greeting = CARD_TASTE_GREETINGS[mix32(hashDate(date)) % CARD_TASTE_GREETINGS.length];
  return `${greeting} ${body}`;
}
