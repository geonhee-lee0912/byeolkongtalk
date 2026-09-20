// 별마루 이번 달(1일~말일) 캘린더 조립 — 순수. dailyLuck(tyme4ts 결정론) × 내 사주 → 날짜별 셀 + 주차 버킷.
// 오늘 판정은 인자로 받은 KST 날짜로만 한다(서버 TZ 에 좌우되지 않게 — 라우트가 계산해 넘긴다).
// P5-2 무료선(지나간 날+오늘 = 무료 · 앞당겨 보기 = 구독)의 단일 원천이 이 파일이다 —
// monthRange·splitByFreeLine·buildCalendarPayload 가 그 경계를 소유한다.
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
  /** 그날을 그렇게 만든 원인 마크(✧끌림 ◇결속 △삐걱 ＋채움). 없으면 빈 배열. */
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

/** 아직 안 온 날에 실어 보내는 것 — 날짜와 **간지뿐**이다.
 *  🔴 간지를 싣는 건 무료선 완화가 아니다: 간지는 만세력이라 누구나 계산할 수 있고(비밀이 아니다),
 *     화면은 그걸로 일지 캐릭터만 그린다(스펙 §3). 돈 받는 건 **판정**(점수·등급·하루 이름·마크·축)
 *     이고 그건 여전히 한 글자도 안 나간다. */
export interface LockedCell {
  date: string;
  ganji: string;
}

/**
 * 무료선(P5-2 스펙 §6): **무료 = 지나간 날 + 오늘 · 구독 = 앞당겨 보기.**
 * 🔴 안 온 날은 "가려서 보여주는" 게 아니라 **판정 결과를 아예 안 실어 보낸다**.
 *    클라에서 가리면 devtools 로 다 보이고, 그건 무료선이 아니라 눈속임이다.
 * 나(DayCell)·우리(PairDayCell) 양쪽에 쓰므로 date·ganji 만 요구하는 제네릭이다.
 */
export function splitByFreeLine<T extends { date: string; ganji: string }>(
  cells: T[],
  todayKst: string,
  entitled: boolean
): { open: T[]; lockedCells: LockedCell[] } {
  if (entitled) return { open: cells, lockedCells: [] };
  const open: T[] = [];
  const lockedCells: LockedCell[] = [];
  for (const c of cells) {
    if (c.date <= todayKst) open.push(c);
    else lockedCells.push({ date: c.date, ganji: c.ganji });
  }
  return { open, lockedCells };
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
 * 나(self) 캘린더 라우트가 응답에 그대로 실어 보내는 조각 — build → 무료선 적용 → 주차 집계를
 * 하나로 묶는다. 🔴 라우트가 이 함수 없이 `buildCalendar` 결과(안 온 날 포함)를 따로 들고 있지
 * 않게 하는 게 핵심이다 — 무료선 우회(비자격자에게 미래 셀을 그대로 응답)를 함수 경계로 막고,
 * free-line.test.ts 가 라우트와 동일한 이 함수를 직접 호출해 계약을 고정한다.
 *
 * pair(우리) 경로는 셀 타입이 다르고(`PairDayCell`) weeks 도 안 쓴다 — `splitByFreeLine` 은
 * 이미 date·ganji 만 요구하는 제네릭이라 self·pair 가 같은 무료선 규칙을 공유한다는 사실은 그 함수
 * 하나로 드러난다. pair 쪽은 라우트에서 `buildPairCalendar` 직후 `splitByFreeLine` 을 바로
 * 호출하는 단일 호출부라, 이 함수처럼 따로 묶으면 단일 사용처 추상화가 된다 — 만들지 않는다.
 */
export function buildCalendarPayload(
  saju: SajuResult,
  dailyLuck: DailyLuck[],
  todayKst: string,
  entitled: boolean
): { cells: DayCell[]; lockedCells: LockedCell[]; weeks: WeekBucket[] } {
  const all = buildCalendar(saju, dailyLuck, todayKst);
  const { open, lockedCells } = splitByFreeLine(all, todayKst, entitled);
  return { cells: open, lockedCells, weeks: weekBuckets(open) };
}
