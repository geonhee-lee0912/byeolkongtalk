// 별마루 30일 캘린더 조립 — 순수. dailyLuck(tyme4ts 결정론) × 내 사주 → 날짜별 셀 + 주차 버킷.
// 오늘 판정은 인자로 받은 KST 날짜로만 한다(서버 TZ 에 좌우되지 않게 — 라우트가 계산해 넘긴다).
import type { DailyLuck, SajuResult } from "@/lib/saju/calc";
import type { FiveElement } from "@/lib/saju/elements";
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

/** KST 날짜 문자열("2026-09-01")로 로컬 자정+12시 Date 를 만든다.
 *  calcTemporalLuck 이 getFullYear/getMonth/getDate(= 로컬 TZ)를 쓰므로, UTC 서버에서
 *  new Date() 를 그대로 넘기면 KST 0~9시에 30일 창이 어제부터 계산된다. 정오로 잡는 건
 *  DST·경계 반올림에 안 걸리게 하기 위함(한국은 DST 없지만 서버 TZ 는 우리가 못 정한다). */
export function baseDateForKst(todayKst: string): Date {
  const [y, m, d] = todayKst.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
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
    return {
      date: d.date,
      ganji: d.stem + d.branch,
      element: d.element,
      score,
      grade: dayGrade(score),
      axes: axisScores(f),
      isToday: d.date === todayKst,
    };
  });
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
