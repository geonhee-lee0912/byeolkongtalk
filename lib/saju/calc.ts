// tyme4ts wrapper — 사용자 입력 (양/음력 + 시간) → 4기둥 + 오행 분포 + 직렬화 형태.
// readings.saju_data JSONB 컬럼에 그대로 저장.
//
// 결정적 계산이라 Claude 미경유. tyme4ts: 절기=천문계산(입춘 년주·절기 월주), 야자시=23시 다음날 일주.
// (구 manseryeok 은 년주 입춘 무시·월주 절기공식 버그로 교체 — 2026-08-23)

import { SolarTime, LunarHour, ChildLimit, Gender, type SixtyCycle } from "tyme4ts";
import type { FiveElement } from "./elements";

export type SajuGender = "male" | "female" | "other";

export interface SajuInput {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour?: number | null; // 0-23, null = 시간 모름
  minute?: number | null; // 0-59, null = 0 처리
  isLunar?: boolean;
  isLeapMonth?: boolean; // 음력 윤달 여부
  gender: SajuGender;
}

/** 시간 기둥(대운 제외) — 오늘 기준 세운/월운/일운. */
export interface PillarLite {
  stem: string;
  branch: string;
  hanja: string;
  element: FiveElement;
}

export interface DailyLuck {
  date: string; // "2026-05-31"
  stem: string;
  branch: string;
  element: FiveElement;
}

export interface TemporalLuck {
  /** 계산 기준일 "YYYY-MM-DD" */
  date: string;
  /** 만 나이 (근사 — 대운 큰 흐름 참고용. 연도 차이만 사용) */
  age: number;
  /** 세운 (오늘의 연주) */
  year: PillarLite;
  /** 월운 (오늘의 월주) */
  month: PillarLite;
  /** 일운 = 오늘 들어온 두 글자 (오늘의 일주) */
  day: PillarLite;
  /** good_days 상품 전용 — 오늘부터 30일 일진 */
  dailyLuck?: DailyLuck[];
}

/** readings.saju_data JSONB 직렬화 형태. */
export interface SajuResult {
  pillars: {
    year: { stem: string; branch: string; hanja: string };
    month: { stem: string; branch: string; hanja: string };
    day: { stem: string; branch: string; hanja: string };
    hour: { stem: string; branch: string; hanja: string };
  };
  /** 일간 — 본인의 본질을 나타내는 핵심 글자 */
  dayStem: string;
  /** 일간의 오행 */
  dayElement: FiveElement;
  /** 오행 분포 (목/화/토/금/수 각 개수, 총합 8) */
  elementCount: Record<FiveElement, number>;
  /** 음/양 분포 (양 개수, 음 개수 — 총합 8) */
  yinYangCount: { yang: number; yin: number };
  /** "갑자년주, 을축월주, ..." 한국어 표기 */
  koreanString: string;
  /** "甲子年柱, 乙丑月柱, ..." 한자 표기 */
  hanjaString: string;
  /** 사용자 입력 메타 (UI 표시용 — 음력 입력이면 음력 그대로 보존) */
  input: {
    gender: SajuGender;
    hourKnown: boolean;
    inputCalendar: "solar" | "lunar";
    isLeapMonth: boolean;
  };
  /** 오늘 기준 시간 기둥 — reading 생성 시 서버가 주입 (legacy reading 은 없음) */
  temporal?: TemporalLuck;
  /** 대운 10년 흐름 — 평생사주(life_full) 생성 시 서버가 주입 (그 외/legacy 는 없음) */
  daeun?: DaeunPillar[];
}

// tyme4ts 는 한자명(甲/子/木)을 반환 → 한국어 인덱스 매핑. 순서는 60갑자 정순이라 index 로 대응.
const STEM_CN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const STEM_KR = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"];
const BRANCH_CN = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const BRANCH_KR = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"];
const ELEMENT_KR: Record<string, FiveElement> = { 木: "목", 火: "화", 土: "토", 金: "금", 水: "수" };

interface PillarParts {
  stem: string; // 한글
  branch: string; // 한글
  hanja: string; // 2자 한자 "甲子"
  stemIdx: number; // 음양·오행 산출용
  branchIdx: number;
  stemElement: FiveElement;
  branchElement: FiveElement;
}

function toParts(cycle: SixtyCycle): PillarParts {
  const stemCn = cycle.getHeavenStem().getName();
  const branchCn = cycle.getEarthBranch().getName();
  const si = STEM_CN.indexOf(stemCn);
  const bi = BRANCH_CN.indexOf(branchCn);
  return {
    stem: STEM_KR[si],
    branch: BRANCH_KR[bi],
    hanja: stemCn + branchCn,
    stemIdx: si,
    branchIdx: bi,
    stemElement: ELEMENT_KR[cycle.getHeavenStem().getElement().getName()],
    branchElement: ELEMENT_KR[cycle.getEarthBranch().getElement().getName()],
  };
}

export function calcSaju(input: SajuInput): SajuResult {
  const hourKnown = input.hour !== null && input.hour !== undefined;
  const hour = hourKnown ? input.hour! : 0; // 모름 = 자정 0시로 가정 (관습적 처리 — 조자시라 당일 일주)
  const minute = input.minute ?? 0;
  const isLunar = input.isLunar === true;

  const eightChar = isLunar
    ? // 윤달 = 음수월 관례 (예: 윤5월 = -5)
      LunarHour.fromYmdHms(
        input.year,
        input.isLeapMonth === true ? -input.month : input.month,
        input.day,
        hour,
        minute,
        0
      ).getEightChar()
    : SolarTime.fromYmdHms(input.year, input.month, input.day, hour, minute, 0)
        .getLunarHour()
        .getEightChar();

  const y = toParts(eightChar.getYear());
  const mo = toParts(eightChar.getMonth());
  const d = toParts(eightChar.getDay());
  const h = toParts(eightChar.getHour());
  const all = [y, mo, d, h];

  const elementCount: Record<FiveElement, number> = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  let yang = 0;
  let yin = 0;
  for (const p of all) {
    elementCount[p.stemElement]++;
    elementCount[p.branchElement]++;
    // 음양 = 천간/지지 index 짝수 = 양 (전통 정순 규칙, 구 manseryeok 과 동일)
    p.stemIdx % 2 === 0 ? yang++ : yin++;
    p.branchIdx % 2 === 0 ? yang++ : yin++;
  }

  return {
    pillars: {
      year: { stem: y.stem, branch: y.branch, hanja: y.hanja },
      month: { stem: mo.stem, branch: mo.branch, hanja: mo.hanja },
      day: { stem: d.stem, branch: d.branch, hanja: d.hanja },
      hour: { stem: h.stem, branch: h.branch, hanja: h.hanja },
    },
    dayStem: d.stem,
    dayElement: d.stemElement,
    elementCount,
    yinYangCount: { yang, yin },
    koreanString: `${y.stem}${y.branch}년주, ${mo.stem}${mo.branch}월주, ${d.stem}${d.branch}일주, ${h.stem}${h.branch}시주`,
    hanjaString: `${y.hanja}年柱, ${mo.hanja}月柱, ${d.hanja}日柱, ${h.hanja}時柱`,
    input: {
      gender: input.gender,
      hourKnown,
      inputCalendar: isLunar ? "lunar" : "solar",
      isLeapMonth: input.isLeapMonth === true,
    },
  };
}

function toPillarLite(parts: PillarParts): PillarLite {
  return { stem: parts.stem, branch: parts.branch, hanja: parts.hanja, element: parts.stemElement };
}

function fmtDate(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 오늘(baseDate) 기준 세운/월운/일운 계산. 정오로 계산해 자시 경계 모호성을 피한다(세운/월운/일운은 시각 무관).
 * @param includeMonth true 면 오늘부터 30일 일진(dailyLuck) 도 채운다 (good_days 전용).
 */
export function calcTemporalLuck(
  baseDate: Date,
  birthYear: number,
  opts?: { includeMonth?: boolean }
): TemporalLuck {
  const ec = SolarTime.fromYmdHms(baseDate.getFullYear(), baseDate.getMonth() + 1, baseDate.getDate(), 12, 0, 0)
    .getLunarHour()
    .getEightChar();

  let dailyLuck: DailyLuck[] | undefined;
  if (opts?.includeMonth) {
    dailyLuck = [];
    for (let i = 0; i < 30; i++) {
      const cur = new Date(baseDate);
      cur.setDate(cur.getDate() + i);
      const dayParts = toParts(
        SolarTime.fromYmdHms(cur.getFullYear(), cur.getMonth() + 1, cur.getDate(), 12, 0, 0)
          .getLunarHour()
          .getEightChar()
          .getDay()
      );
      dailyLuck.push({ date: fmtDate(cur), stem: dayParts.stem, branch: dayParts.branch, element: dayParts.stemElement });
    }
  }

  return {
    date: fmtDate(baseDate),
    age: baseDate.getFullYear() - birthYear,
    year: toPillarLite(toParts(ec.getYear())),
    month: toPillarLite(toParts(ec.getMonth())),
    day: toPillarLite(toParts(ec.getDay())),
    dailyLuck,
  };
}

/** 대운(10년 단위) 한 기둥. */
export interface DaeunPillar {
  startAge: number; // 이 대운 시작 만나이
  endAge: number; // 종료 만나이
  stem: string; // 한글 천간
  branch: string; // 한글 지지
  hanja: string; // "戊辰"
  stemElement: FiveElement;
  branchElement: FiveElement;
}

/**
 * 대운(大運) 계산 — tyme4ts ChildLimit → DecadeFortune. count 개 반환.
 * gender other 는 방향 산출상 MAN 으로 근사(대운 순/역행이 성별 의존). 시간 모름이면 자정 기준.
 * 결정적 계산이라 Claude 미경유 — 평생사주·인생그래프의 룰 소스.
 */
export function calcDaeun(input: SajuInput, count = 9): DaeunPillar[] {
  const hour = input.hour ?? 0;
  const minute = input.minute ?? 0;
  const isLunar = input.isLunar === true;
  const solar = isLunar
    ? LunarHour.fromYmdHms(
        input.year,
        input.isLeapMonth === true ? -input.month : input.month,
        input.day,
        hour,
        minute,
        0
      ).getSolarTime()
    : SolarTime.fromYmdHms(input.year, input.month, input.day, hour, minute, 0);
  const gender = input.gender === "female" ? Gender.WOMAN : Gender.MAN;
  const childLimit = ChildLimit.fromSolarTime(solar, gender);
  const out: DaeunPillar[] = [];
  let df = childLimit.getStartDecadeFortune();
  for (let i = 0; i < count; i++) {
    const p = toParts(df.getSixtyCycle());
    out.push({
      startAge: df.getStartAge(),
      endAge: df.getEndAge(),
      stem: p.stem,
      branch: p.branch,
      hanja: p.hanja,
      stemElement: p.stemElement,
      branchElement: p.branchElement,
    });
    df = df.next(1);
  }
  return out;
}
