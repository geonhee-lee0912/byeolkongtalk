// 공용 섹션 리포트 엔진 — 신규 사주 텍스트 리포트 다수가 공유하는 단일 스키마/파서/렌더 계약.
// (daily/monthly/saju_full/compat 는 전용 스키마 유지. 신규 텍스트 종목은 전부 이 엔진.)
// 저장은 messages.content 에 병합 JSON 문자열(v:1). 각 종목의 섹션 구성은 prompt.ts genericGuide 가 정함.

import { parseReportJson } from "./json-recover";
import type { FortuneType } from "./types";

/** 공용 섹션 엔진을 쓰는 신규 종목(2026-08-30). daily/monthly/saju_full/compat/good_days 는 전용 스키마 유지. */
// element_balance 는 공용 스키마 + 전용 렌더(오행 차트)라 여기 포함. saju_report_card·life_graph 는 전용 스키마.
export const GENERIC_FORTUNE_TYPES: readonly FortuneType[] = [
  "nature_self", "talent_path", "user_manual", "element_balance", "life_full",
  "love_self", "love_year", "marriage", "wealth_vessel", "wealth_year",
  "career_timing", "fact_bomb", "past_life",
];

export function isGenericFortuneType(t: FortuneType): boolean {
  return (GENERIC_FORTUNE_TYPES as readonly string[]).includes(t);
}

/** 대운을 프롬프트에 주입해야 하는 종목(평생사주·인생그래프). */
export const DAEUN_FORTUNE_TYPES: readonly FortuneType[] = ["life_full", "life_graph"];
export function needsDaeun(t: FortuneType): boolean {
  return (DAEUN_FORTUNE_TYPES as readonly string[]).includes(t);
}

export interface GenericReportSection {
  heading: string; // 섹션 제목 (예: "타고난 기질")
  body: string; // 본문
}

/** 대운(10년) 개인화 한 줄 — 평생사주(life_full)만 생성. startAge 로 대운 표 행과 매칭. */
export interface DaeunLine {
  startAge: number; // 대운 시작 만나이(대운 표의 앞 숫자) — 매칭 키
  line: string; // "내 사주 × 이 대운" 이 만나 도드라지는 일 한 줄
}

/** AI 가 생성하는 부분 — intro + 섹션 N개 + note. daeunLines 는 life_full 만(그 외 null). */
export interface GenericReportAI {
  intro: string; // 도입부
  sections: GenericReportSection[]; // 종목별 N개 (개수는 prompt/parser 가 담당, 스키마는 배열)
  note: string; // 별콩이 한마디
  daeunLines?: DaeunLine[]; // 대운 개인화 한 줄(life_full 전용, 있을 때만)
}

/** OpenAI 구조화 출력 스키마 — strict. 섹션 개수는 프롬프트가 지시(스키마는 배열이라 강제 불가).
 * daeunLines 는 nullable(life_full 만 채움, 그 외 null). intro 직후에 둬 긴 sections 절단에도 살아남게 한다. */
export const GENERIC_REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intro: { type: "string" },
    daeunLines: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        properties: { startAge: { type: "integer" }, line: { type: "string" } },
        required: ["startAge", "line"],
      },
    },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { heading: { type: "string" }, body: { type: "string" } },
        required: ["heading", "body"],
      },
    },
    note: { type: "string" },
  },
  required: ["intro", "daeunLines", "sections", "note"],
} as const;

/** 저장/렌더 최종 형태. */
export interface GenericReport extends GenericReportAI {
  v: 1;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** AI 원문 → 검증된 GenericReportAI. 실패·필수 누락 시 null. 섹션은 최소 1개 유효해야 함. */
export function parseGenericReportJson(raw: string): GenericReportAI | null {
  const o = parseReportJson(raw);
  if (!o) return null;
  if (!isNonEmptyString(o.intro)) return null;
  if (!isNonEmptyString(o.note)) return null;
  if (!Array.isArray(o.sections)) return null;

  const sections: GenericReportSection[] = [];
  for (const s of o.sections) {
    if (s && typeof s === "object") {
      const heading = (s as Record<string, unknown>).heading;
      const body = (s as Record<string, unknown>).body;
      if (isNonEmptyString(heading) && isNonEmptyString(body)) {
        sections.push({ heading: heading.trim(), body: body.trim() });
      }
    }
  }
  if (sections.length === 0) return null;

  const daeunLines = parseDaeunLines(o.daeunLines);

  return {
    intro: o.intro.trim(),
    sections,
    note: o.note.trim(),
    ...(daeunLines ? { daeunLines } : {}),
  };
}

/** daeunLines(nullable) → 검증된 배열 또는 undefined. startAge 정수 + 비어있지 않은 line 만. */
function parseDaeunLines(raw: unknown): DaeunLine[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: DaeunLine[] = [];
  for (const d of raw) {
    if (d && typeof d === "object") {
      const sa = (d as Record<string, unknown>).startAge;
      const line = (d as Record<string, unknown>).line;
      if (typeof sa === "number" && Number.isFinite(sa) && isNonEmptyString(line)) {
        out.push({ startAge: Math.trunc(sa), line: line.trim() });
      }
    }
  }
  return out.length > 0 ? out : undefined;
}

export function buildGenericReport(ai: GenericReportAI): GenericReport {
  return { v: 1, ...ai };
}

export function serializeGenericReport(report: GenericReport): string {
  return JSON.stringify(report);
}

/** messages.content 가 generic 저장본(v:1 JSON + sections 배열)이면 파싱, 아니면 null. */
export function tryParseStoredGenericReport(content: string): GenericReport | null {
  if (typeof content !== "string") return null;
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("{")) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(content);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (!Array.isArray(o.sections)) return null;
  if (!isNonEmptyString(o.intro) || !isNonEmptyString(o.note)) return null;
  return obj as GenericReport;
}
