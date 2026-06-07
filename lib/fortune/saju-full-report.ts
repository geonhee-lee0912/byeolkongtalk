// 2026년 사주 분석(saju_full) 전용 — AI JSON 파싱·검증 + 2026 병오년 고정값 병합 + 저장/복원.
// daily-report.ts / monthly-report.ts 와 동형. 저장은 messages.content 에 병합 JSON 문자열(v:1).
// 2026 은 고정 연도라 temporal(일진/월건) 의존이 없다.

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
  };
  monthly: SajuFullMonth[]; // 1~12월 고정 12개
  timing: {
    good: string; // 흐름 좋은 달 (예: "4 · 9 · 11월")
    caution: string; // 점검할 달 (예: "6 · 7월")
  };
  actions: string[]; // 올해 실천 3가지
  note: string; // 별콩이의 한마디
}

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
  if (typeof raw !== "string") return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  let obj: unknown;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

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
    },
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
