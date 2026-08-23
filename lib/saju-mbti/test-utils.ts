import type { SajuResult } from "@/lib/saju/calc";
import { STEM_ELEMENT } from "@/lib/saju/pairing";

/** 8글자를 직접 지정해 SajuResult 를 만든다(매핑이 읽는 필드만 채움). */
export function mkSaju(
  pillars: {
    year: readonly [string, string];
    month: readonly [string, string];
    day: readonly [string, string];
    hour: readonly [string, string];
  },
  opts: { hourKnown?: boolean } = {}
): SajuResult {
  const cell = ([s, b]: readonly [string, string]) => ({ stem: s, branch: b, hanja: "" });
  const dayStem = pillars.day[0];
  return {
    pillars: {
      year: cell(pillars.year),
      month: cell(pillars.month),
      day: cell(pillars.day),
      hour: cell(pillars.hour),
    },
    dayStem,
    dayElement: STEM_ELEMENT[dayStem],
    elementCount: { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 },
    yinYangCount: { yang: 0, yin: 0 },
    koreanString: "",
    hanjaString: "",
    input: { gender: "other", hourKnown: opts.hourKnown ?? true, inputCalendar: "solar", isLeapMonth: false },
  };
}
