// 별마루 30일 캘린더 조립 — 순수. dailyLuck(tyme4ts 결정론) × 내 사주 → 날짜별 셀 + 주차 버킷.
// 오늘 판정은 인자로 받은 KST 날짜로만 한다(서버 TZ 에 좌우되지 않게 — 라우트가 계산해 넘긴다).
import type { DailyLuck, SajuResult } from "@/lib/saju/calc";
import type { FiveElement } from "@/lib/saju/elements";
import type { ElementRelation } from "@/lib/saju/pairing";
import { tenGod, type TenGod } from "@/lib/saju/pairing";
import { dayMarks, type DayMark } from "./day-label";
import {
  dayFactors,
  dayScore,
  dayGrade,
  axisScores,
  type AxisScores,
  type DayGrade,
  type DaySelf,
} from "./day-score";

export interface DayCell {
  /** "2026-09-01" */
  date: string;
  /** 한글 간지 2자 "기축" */
  ganji: string;
  element: FiveElement;
  score: number;
  grade: DayGrade;
  axes: AxisScores;
  /** 그날 천간 오행이 내 일간 오행과 만나는 관계 — ⑥ 골격 문장 뱅크 키(생아/아극/비화/아생/극아). */
  relation: ElementRelation;
  /** 그날 천간을 내 일간 기준으로 본 십신 — 하루 이름의 키(P5-1). relation 을 음양으로 쪼갠 것.
   *  이름 문자열은 싣지 않는다 — 소비처가 DAY_NAME[tenGod] 로 직접 푼다(PairDayCell 이
   *  PAIR_TONE_LABEL 을 클라에서 직접 쓰는 것과 같은 패턴). 와이어에 중복을 두지 않는다. */
  tenGod: TenGod;
  /** 그날을 그렇게 만든 원인 마크(✧천간합 ◇육합 △충 ＋빈 곳). 없으면 빈 배열. */
  marks: DayMark[];
  isToday: boolean;
}

/** SajuResult → 판정 엔진 입력. 일지는 pillars.day.branch 에만 있다(dayStem 과 달리 최상위 필드가 없다). */
export function toDaySelf(saju: SajuResult): DaySelf {
  return {
    dayStem: saju.dayStem,
    dayBranch: saju.pillars.day.branch,
    dayElement: saju.dayElement,
    elementCount: saju.elementCount,
  };
}

export function buildCalendar(
  saju: SajuResult,
  dailyLuck: DailyLuck[],
  todayKst: string
): DayCell[] {
  const self = toDaySelf(saju);
  return dailyLuck.map((d) => {
    const f = dayFactors(self, { stem: d.stem, branch: d.branch, element: d.element });
    const score = dayScore(f);
    const tg = tenGod(self.dayStem, d.stem);
    return {
      date: d.date,
      ganji: d.stem + d.branch,
      element: d.element,
      score,
      grade: dayGrade(score),
      axes: axisScores(f),
      relation: f.relation,
      tenGod: tg,
      marks: dayMarks(f),
      isToday: d.date === todayKst,
    };
  });
}

/**
 * KST 오늘 → 그 달의 1일·말일. P5-2 달력 범위("이번 달")의 단일 원천.
 * Date.UTC(y, m, 0) 은 m 이 1-based 일 때 그 달의 말일을 준다(0일 = 전달 마지막 날).
 * UTC 로 계산하는 건 윤년 판정만 쓰고 TZ 영향을 안 받기 위함 — 반환은 순수 문자열 조립이다.
 */
export function monthRange(todayKst: string): { start: string; end: string } {
  const [y, m] = todayKst.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ym = todayKst.slice(0, 7);
  return { start: `${ym}-01`, end: `${ym}-${String(last).padStart(2, "0")}` };
}

/**
 * 무료선(P5-2 스펙 §6): **무료 = 지나간 날 + 오늘 · 구독 = 앞당겨 보기.**
 * 🔴 안 온 날은 "가려서 보여주는" 게 아니라 **판정 결과를 아예 안 실어 보낸다** — 날짜만 남는다.
 *    클라에서 가리면 devtools 로 다 보이고, 그건 무료선이 아니라 눈속임이다.
 * 나(DayCell)·우리(PairDayCell) 양쪽에 쓰므로 date 만 요구하는 제네릭이다.
 */
export function splitByFreeLine<T extends { date: string }>(
  cells: T[],
  todayKst: string,
  entitled: boolean
): { open: T[]; lockedDates: string[] } {
  if (entitled) return { open: cells, lockedDates: [] };
  const open: T[] = [];
  const lockedDates: string[] = [];
  for (const c of cells) {
    if (c.date <= todayKst) open.push(c);
    else lockedDates.push(c.date);
  }
  return { open, lockedDates };
}

// ⚠️ 여기서 "주차"는 오늘부터 7일씩 끊은 롤링 윈도우다 — 화면 그리드(Task 5, 일~토 요일 정렬 +
// 앞쪽 빈칸)가 그리는 "1주차" 행과 경계가 다르다. 둘을 같은 "주"로 읽지 말 것.
export interface WeekBucket {
  /** 1부터 */
  index: number;
  startDate: string;
  endDate: string;
  good: number;
  caution: number;
  avgScore: number;
}

/** 7일씩 묶은 버킷 — 무료 주차 요약의 데이터. 문장은 ⑤ 정적 콘텐츠 계획에서 얹는다. */
export function weekBuckets(cells: DayCell[]): WeekBucket[] {
  const out: WeekBucket[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const chunk = cells.slice(i, i + 7);
    out.push({
      index: out.length + 1,
      startDate: chunk[0].date,
      endDate: chunk[chunk.length - 1].date,
      good: chunk.filter((c) => c.grade.tone === "good").length,
      caution: chunk.filter((c) => c.grade.tone === "caution").length,
      avgScore: Math.round(chunk.reduce((s, c) => s + c.score, 0) / chunk.length),
    });
  }
  return out;
}
