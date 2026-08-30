// 2026년 사주 분석(saju_full) 전용 — AI JSON 파싱·검증 + 2026 병오년 고정값 병합 + 저장/복원.
// daily-report.ts / monthly-report.ts 와 동형. 저장은 messages.content 에 병합 JSON 문자열(v:1).
// 2026 은 고정 연도라 temporal(일진/월건) 의존이 없다.

import { parseReportJson } from "./json-recover";

/** 2026 병오년 — 코드 고정 결정론적 값. */
export const YEAR_2026 = { stem: "병", branch: "오", hanja: "丙午" } as const;

export interface SajuFullMonth {
  month: number; // 1~12
  body: string;
}

/** AI 가 생성하는 부분. */
export interface SajuFullReportAI {
  theme: string; // 2026 한 해 테마 한 줄
  summary: string; // 한 해 요약 문단 (3~4문장)
  lucky: {
    color: string; // 행운 색
    direction: string; // 행운 방향 (예: 동쪽)
    months: string; // 행운의 달 (예: "3월 · 8월")
    keyword: string; // 키워드 한 단어
  };
  self: {
    nature: string; // 타고난 기질·성격
    strength: string; // 강점·재능
    caution: string; // 조심할 성향·보완점
    balance: {
      lack: string; // 오행 밸런스 진단 서술
      supplements: string[]; // 보완 키워드 칩 (2~4개)
    };
    aptitude: string; // 타고난 적성·어울리는 일
  };
  year: {
    flow: string; // 2026 큰 흐름·테마
    mind: string; // 마음·감정 흐름
    love: string; // 사랑·인연
    relationship: string; // 인간관계·사회
    career: string; // 일·커리어
    wealth: string; // 재물·금전
    health: string; // 건강·컨디션
    // 신설 2026 세부 영역 (2026-08-30) — 구 저장본 호환 위해 optional
    study?: string; // 2026 학업·자기계발
    moving?: string; // 2026 이동·변화(이사·이직·여행)
    family?: string; // 2026 가족·주변
  };
  relations2026: string; // 2026 인연 지도 — 힘이 되는 관계 결 + 유의할 패턴
  mission: string; // 올해의 성장 과제 — 타고난 강점을 펼치는 방향
  // 신설 (2026-08-30, 전부 2026 범위 — 대운/인생 전체는 평생사주 상품 몫) — optional
  halves?: { first: string; second: string }; // 2026 상반기/하반기 심층
  turning?: string; // 2026 전환점·변화 포인트
  remedies?: string; // 2026 개운법 (색·방향·습관·관계)
  // 2026-08-30 2차 확장 — 전부 2026 범위. 구 저장본 호환 위해 optional
  wealthDeep?: string; // 2026 재물 심층 (정재·편재·지출·리스크)
  careerDeep?: string; // 2026 일·커리어 심층
  loveDeep?: string; // 2026 연애 심층 (솔로/커플·결혼 흐름)
  healthDeep?: string; // 2026 건강 심층 (몸·마음·루틴)
  quarters?: { q1: string; q2: string; q3: string; q4: string }; // 2026 분기별 흐름
  opportunities?: string[]; // 놓치면 아까운 기회 3
  pitfalls?: string[]; // 조심할 함정 3
  elementUsage?: string; // 2026 오행 활용법
  relationsDeep?: string; // 2026 관계 지도 확장 (귀인·정리·새인연)
  selfcare?: string; // 2026 셀프케어 루틴
  monthly: SajuFullMonth[]; // 1~12월 고정 12개
  timing: {
    good: string; // 흐름 좋은 달 (예: "4 · 9 · 11월")
    caution: string; // 점검할 달 (예: "6 · 7월")
  };
  actions: string[]; // 올해 실천 3가지
  note: string; // 별콩이의 한마디
}

/** OpenAI 구조화 출력 스키마 — SajuFullReportAI 미러. strict: 전 필드 required + additionalProperties:false.
 *  개수 규칙(monthly 12·actions 3·supplements 2~4)은 parseSajuFullReportJson 이 담당(strict 로 강제 불가). */
export const SAJU_FULL_REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    theme: { type: "string" },
    summary: { type: "string" },
    lucky: {
      type: "object",
      additionalProperties: false,
      properties: {
        color: { type: "string" },
        direction: { type: "string" },
        months: { type: "string" },
        keyword: { type: "string" },
      },
      required: ["color", "direction", "months", "keyword"],
    },
    self: {
      type: "object",
      additionalProperties: false,
      properties: {
        nature: { type: "string" },
        strength: { type: "string" },
        caution: { type: "string" },
        balance: {
          type: "object",
          additionalProperties: false,
          properties: {
            lack: { type: "string" },
            supplements: { type: "array", items: { type: "string" } },
          },
          required: ["lack", "supplements"],
        },
        aptitude: { type: "string" },
      },
      required: ["nature", "strength", "caution", "balance", "aptitude"],
    },
    year: {
      type: "object",
      additionalProperties: false,
      properties: {
        flow: { type: "string" },
        mind: { type: "string" },
        love: { type: "string" },
        relationship: { type: "string" },
        career: { type: "string" },
        wealth: { type: "string" },
        health: { type: "string" },
        study: { type: "string" },
        moving: { type: "string" },
        family: { type: "string" },
      },
      required: ["flow", "mind", "love", "relationship", "career", "wealth", "health", "study", "moving", "family"],
    },
    relations2026: { type: "string" },
    mission: { type: "string" },
    halves: {
      type: "object",
      additionalProperties: false,
      properties: { first: { type: "string" }, second: { type: "string" } },
      required: ["first", "second"],
    },
    turning: { type: "string" },
    remedies: { type: "string" },
    wealthDeep: { type: "string" },
    careerDeep: { type: "string" },
    loveDeep: { type: "string" },
    healthDeep: { type: "string" },
    quarters: {
      type: "object",
      additionalProperties: false,
      properties: {
        q1: { type: "string" },
        q2: { type: "string" },
        q3: { type: "string" },
        q4: { type: "string" },
      },
      required: ["q1", "q2", "q3", "q4"],
    },
    opportunities: { type: "array", items: { type: "string" } },
    pitfalls: { type: "array", items: { type: "string" } },
    elementUsage: { type: "string" },
    relationsDeep: { type: "string" },
    selfcare: { type: "string" },
    monthly: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { month: { type: "number" }, body: { type: "string" } },
        required: ["month", "body"],
      },
    },
    timing: {
      type: "object",
      additionalProperties: false,
      properties: { good: { type: "string" }, caution: { type: "string" } },
      required: ["good", "caution"],
    },
    actions: { type: "array", items: { type: "string" } },
    note: { type: "string" },
  },
  required: [
    "theme", "summary", "lucky", "self", "year", "relations2026",
    "mission", "halves", "turning", "remedies",
    "wealthDeep", "careerDeep", "loveDeep", "healthDeep", "quarters",
    "opportunities", "pitfalls", "elementUsage", "relationsDeep", "selfcare",
    "monthly", "timing", "actions", "note",
  ],
} as const;

/** 저장/렌더 최종 형태. */
export interface SajuFullReport extends SajuFullReportAI {
  v: 1;
  year2026: { stem: string; branch: string; hanja: string };
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function cleanStringArray(v: unknown, min: number, max: number): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    if (isNonEmptyString(item)) out.push(item.trim());
    if (out.length >= max) break;
  }
  if (out.length < min) return null;
  return out;
}

/**
 * AI 원문에서 JSON 추출·검증. 코드펜스/잡텍스트가 섞여도 첫 '{' ~ 마지막 '}' 만 파싱.
 * 실패하거나 필수 필드 누락 시 null. monthly 는 1~12월 순서로 정렬해서 반환.
 */
export function parseSajuFullReportJson(raw: string): SajuFullReportAI | null {
  const o = parseReportJson(raw);
  if (!o) return null;

  if (!isNonEmptyString(o.theme)) return null;
  if (!isNonEmptyString(o.summary)) return null;
  if (!isNonEmptyString(o.note)) return null;

  const lucky = o.lucky as Record<string, unknown> | undefined;
  if (
    !lucky ||
    !isNonEmptyString(lucky.color) ||
    !isNonEmptyString(lucky.direction) ||
    !isNonEmptyString(lucky.months) ||
    !isNonEmptyString(lucky.keyword)
  )
    return null;

  const self = o.self as Record<string, unknown> | undefined;
  if (
    !self ||
    !isNonEmptyString(self.nature) ||
    !isNonEmptyString(self.strength) ||
    !isNonEmptyString(self.caution) ||
    !isNonEmptyString(self.aptitude)
  )
    return null;
  const selfBalance = self.balance as Record<string, unknown> | undefined;
  if (!selfBalance || !isNonEmptyString(selfBalance.lack)) return null;
  const supplements = cleanStringArray(selfBalance.supplements, 1, 4);
  if (!supplements) return null;

  const year = o.year as Record<string, unknown> | undefined;
  if (
    !year ||
    !isNonEmptyString(year.flow) ||
    !isNonEmptyString(year.mind) ||
    !isNonEmptyString(year.love) ||
    !isNonEmptyString(year.relationship) ||
    !isNonEmptyString(year.career) ||
    !isNonEmptyString(year.wealth) ||
    !isNonEmptyString(year.health)
  )
    return null;

  if (!isNonEmptyString(o.relations2026)) return null;
  if (!isNonEmptyString(o.mission)) return null;

  const timing = o.timing as Record<string, unknown> | undefined;
  if (!timing || !isNonEmptyString(timing.good) || !isNonEmptyString(timing.caution))
    return null;

  const actions = cleanStringArray(o.actions, 3, 3);
  if (!actions) return null;

  // monthly — 1~12월 전부 body 존재해야 함
  if (!Array.isArray(o.monthly)) return null;
  const bodyByMonth = new Map<number, string>();
  for (const m of o.monthly) {
    if (m && typeof m === "object") {
      const month = (m as Record<string, unknown>).month;
      const body = (m as Record<string, unknown>).body;
      if (typeof month === "number" && isNonEmptyString(body)) {
        bodyByMonth.set(Math.round(month), body.trim());
      }
    }
  }
  const monthly: SajuFullMonth[] = [];
  for (let mo = 1; mo <= 12; mo++) {
    const body = bodyByMonth.get(mo);
    if (!body) return null;
    monthly.push({ month: mo, body });
  }

  return {
    theme: o.theme.trim(),
    summary: o.summary.trim(),
    lucky: {
      color: lucky.color.trim(),
      direction: lucky.direction.trim(),
      months: lucky.months.trim(),
      keyword: lucky.keyword.trim(),
    },
    self: {
      nature: self.nature.trim(),
      strength: self.strength.trim(),
      caution: self.caution.trim(),
      balance: { lack: selfBalance.lack.trim(), supplements },
      aptitude: self.aptitude.trim(),
    },
    year: {
      flow: year.flow.trim(),
      mind: year.mind.trim(),
      love: year.love.trim(),
      relationship: year.relationship.trim(),
      career: year.career.trim(),
      wealth: year.wealth.trim(),
      health: year.health.trim(),
      // 신설 2026 세부 영역 — optional(누락해도 파싱 실패 아님)
      ...(isNonEmptyString(year.study) ? { study: year.study.trim() } : {}),
      ...(isNonEmptyString(year.moving) ? { moving: year.moving.trim() } : {}),
      ...(isNonEmptyString(year.family) ? { family: year.family.trim() } : {}),
    },
    relations2026: o.relations2026.trim(),
    mission: o.mission.trim(),
    // 신설 — optional
    ...(() => {
      const h = o.halves as Record<string, unknown> | undefined;
      return h && isNonEmptyString(h.first) && isNonEmptyString(h.second)
        ? { halves: { first: h.first.trim(), second: h.second.trim() } }
        : {};
    })(),
    ...(isNonEmptyString(o.turning) ? { turning: o.turning.trim() } : {}),
    ...(isNonEmptyString(o.remedies) ? { remedies: o.remedies.trim() } : {}),
    // 2026-08-30 2차 확장 — 전부 optional 추출
    ...(isNonEmptyString(o.wealthDeep) ? { wealthDeep: o.wealthDeep.trim() } : {}),
    ...(isNonEmptyString(o.careerDeep) ? { careerDeep: o.careerDeep.trim() } : {}),
    ...(isNonEmptyString(o.loveDeep) ? { loveDeep: o.loveDeep.trim() } : {}),
    ...(isNonEmptyString(o.healthDeep) ? { healthDeep: o.healthDeep.trim() } : {}),
    ...(() => {
      const q = o.quarters as Record<string, unknown> | undefined;
      return q && isNonEmptyString(q.q1) && isNonEmptyString(q.q2) && isNonEmptyString(q.q3) && isNonEmptyString(q.q4)
        ? { quarters: { q1: q.q1.trim(), q2: q.q2.trim(), q3: q.q3.trim(), q4: q.q4.trim() } }
        : {};
    })(),
    ...(() => { const a = cleanStringArray(o.opportunities, 1, 5); return a ? { opportunities: a } : {}; })(),
    ...(() => { const a = cleanStringArray(o.pitfalls, 1, 5); return a ? { pitfalls: a } : {}; })(),
    ...(isNonEmptyString(o.elementUsage) ? { elementUsage: o.elementUsage.trim() } : {}),
    ...(isNonEmptyString(o.relationsDeep) ? { relationsDeep: o.relationsDeep.trim() } : {}),
    ...(isNonEmptyString(o.selfcare) ? { selfcare: o.selfcare.trim() } : {}),
    monthly,
    timing: { good: timing.good.trim(), caution: timing.caution.trim() },
    actions,
    note: o.note.trim(),
  };
}

/** AI JSON + 2026 고정값 → 저장 최종본. */
export function buildSajuFullReport(ai: SajuFullReportAI): SajuFullReport {
  return {
    v: 1,
    ...ai,
    year2026: { ...YEAR_2026 },
  };
}

/** 저장본 직렬화. */
export function serializeSajuFullReport(report: SajuFullReport): string {
  return JSON.stringify(report);
}

/**
 * messages.content 가 saju_full 저장본(v:1 JSON)이면 파싱, 아니면(legacy 줄글) null.
 */
export function tryParseStoredSajuFullReport(content: string): SajuFullReport | null {
  if (typeof content !== "string") return null;
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("{")) return null; // legacy 줄글 빠른 컷
  let obj: unknown;
  try {
    obj = JSON.parse(content);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (!o.year2026 || typeof o.year2026 !== "object") return null;
  if (!Array.isArray(o.monthly)) return null;
  if (!o.year || typeof o.year !== "object") return null;
  return obj as SajuFullReport;
}
