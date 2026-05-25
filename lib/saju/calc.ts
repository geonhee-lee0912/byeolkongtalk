// manseryeok wrapper — 사용자 입력 (양/음력 + 시간) → 4기둥 + 오행 분포 + 직렬화 형태.
// readings.saju_data JSONB 컬럼에 그대로 저장.
//
// 결정적 계산이라 Claude 미경유. 라이브러리 자체는 deps 없음 + Edge 호환 추정.

import {
  calculateFourPillars,
  type BirthInfo,
  type FourPillarsDetail,
  type FiveElement,
} from "manseryeok";

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
  /** "갑자년 을축월 ..." 한국어 표기 */
  koreanString: string;
  /** "甲子年 乙丑月 ..." 한자 표기 */
  hanjaString: string;
  /** 사용자 입력 메타 (UI 표시용 — 음력 입력이면 음력 그대로 보존) */
  input: {
    gender: SajuGender;
    hourKnown: boolean;
    inputCalendar: "solar" | "lunar";
    isLeapMonth: boolean;
  };
}

function countElements(detail: FourPillarsDetail): Record<FiveElement, number> {
  const acc: Record<FiveElement, number> = {
    목: 0,
    화: 0,
    토: 0,
    금: 0,
    수: 0,
  };
  for (const e of [
    detail.yearElement.stem,
    detail.yearElement.branch,
    detail.monthElement.stem,
    detail.monthElement.branch,
    detail.dayElement.stem,
    detail.dayElement.branch,
    detail.hourElement.stem,
    detail.hourElement.branch,
  ]) {
    acc[e]++;
  }
  return acc;
}

function countYinYang(detail: FourPillarsDetail): {
  yang: number;
  yin: number;
} {
  let yang = 0;
  let yin = 0;
  for (const yy of [
    detail.yearYinYang.stem,
    detail.yearYinYang.branch,
    detail.monthYinYang.stem,
    detail.monthYinYang.branch,
    detail.dayYinYang.stem,
    detail.dayYinYang.branch,
    detail.hourYinYang.stem,
    detail.hourYinYang.branch,
  ]) {
    if (yy === "양") yang++;
    else yin++;
  }
  return { yang, yin };
}

export function calcSaju(input: SajuInput): SajuResult {
  const hourKnown = input.hour !== null && input.hour !== undefined;
  const hour = hourKnown ? input.hour! : 0; // 모름 = 자정 0시로 가정 (관습적 처리)
  const minute = input.minute ?? 0;

  const birthInfo: BirthInfo = {
    year: input.year,
    month: input.month,
    day: input.day,
    hour,
    minute,
    isLunar: input.isLunar === true,
    isLeapMonth: input.isLeapMonth === true,
  };

  const detail = calculateFourPillars(birthInfo);

  return {
    pillars: {
      year: {
        stem: detail.year.heavenlyStem,
        branch: detail.year.earthlyBranch,
        hanja: detail.yearHanja,
      },
      month: {
        stem: detail.month.heavenlyStem,
        branch: detail.month.earthlyBranch,
        hanja: detail.monthHanja,
      },
      day: {
        stem: detail.day.heavenlyStem,
        branch: detail.day.earthlyBranch,
        hanja: detail.dayHanja,
      },
      hour: {
        stem: detail.hour.heavenlyStem,
        branch: detail.hour.earthlyBranch,
        hanja: detail.hourHanja,
      },
    },
    dayStem: detail.day.heavenlyStem,
    dayElement: detail.dayElement.stem,
    elementCount: countElements(detail),
    yinYangCount: countYinYang(detail),
    koreanString: detail.toString(),
    hanjaString: detail.toHanjaString(),
    input: {
      gender: input.gender,
      hourKnown,
      inputCalendar: input.isLunar ? "lunar" : "solar",
      isLeapMonth: input.isLeapMonth === true,
    },
  };
}
