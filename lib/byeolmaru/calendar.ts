// 별마루 이번 달(1일~말일) 캘린더 조립 — 순수. dailyLuck(tyme4ts 결정론) × 내 사주 → 날짜별 셀 + 주차 버킷.
// 오늘 판정은 인자로 받은 KST 날짜로만 한다(서버 TZ 에 좌우되지 않게 — 라우트가 계산해 넘긴다).
// 🔴 달력은 **전면 무료**다(2026-09-26). 자격에 따라 갈리는 건 리포트 글뿐이고, 칸의 판정
//    (점수·등급·마크·축)은 룰 계산이라 누구에게나 나간다.
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
  /** 2자 한자 "己丑" — 상세 화면의 일진 히어로용(셀·스트립은 쓰지 않는다). */
  hanja: string;
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
  /** 그날을 그렇게 만든 원인 마크(✧설렘 ◇척척 △삐걱 ＋채움). 없으면 빈 배열. */
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
      hanja: d.hanja,
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

/** 판정 없이 날짜만 있는 칸. 🔴 남은 용도는 **게스트 셸 하나**다 —
 *  비로그인·생일 미입력이 보는 "안 칠해진 이번 달"(ByeolmaruHub 의 EmptyMonthShell).
 *  거기서의 "잠김"은 "안 온 날"이 아니라 "생일이 없어서 못 보는 날"이다.
 *  🔴 무료선(비자격자에게 미래를 안 싣던 splitByFreeLine)은 2026-09-26 에 폐지됐다 —
 *     달력 칸은 룰 계산이라 변동비가 0인데 잠겨 있었고, 그 잠금은 누를 수도 없었고
 *     구독을 말하지도 않았다. 되살리기 전에 스펙 2026-09-26 §2 의 기각안을 읽을 것. */
export interface LockedCell {
  date: string;
  ganji: string;
}

// ⚠️ 여기서 "주차"는 이번 달 1일부터 7일씩 끊은 윈도우다 — 화면 그리드(CalendarGrid, 일~토 요일 정렬 +
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

/**
 * 나(self) 캘린더 라우트가 응답에 그대로 실어 보내는 조각 — build → 이번 달/채움 분리 →
 * 주차 집계를 하나로 묶는다.
 *
 * 🔴 `cells`(이번 달)와 `fillCells`(앞뒤 채움)를 **필드로 가른다.** 섞어 보내면 weekBuckets 가
 *    조용히 다른 달 날짜를 세서 "이번 달 잘 맞는 날 N일"이 거짓이 된다. 소비처가 매번 월
 *    접두사를 비교해 거르는 규약은 한 곳만 빠뜨려도 틀리므로 경계를 필드로 굳힌다.
 *
 * @param gridLuck 격자가 그리는 범위의 일진 — 이번 달 + (나중에) 앞뒤 채움을 모두 덮는다.
 */
export function buildCalendarPayload(
  saju: SajuResult,
  gridLuck: DailyLuck[],
  todayKst: string
): { cells: DayCell[]; fillCells: DayCell[]; weeks: WeekBucket[] } {
  const { start, end } = monthRange(todayKst);
  const all = buildCalendar(saju, gridLuck, todayKst);
  const cells = all.filter((c) => c.date >= start && c.date <= end);
  const fillCells = all.filter((c) => c.date < start || c.date > end);
  return { cells, fillCells, weeks: weekBuckets(cells) };
}
