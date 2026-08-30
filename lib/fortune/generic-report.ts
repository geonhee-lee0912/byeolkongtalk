// 공용 섹션 리포트 엔진 — 신규 사주 텍스트 리포트 다수가 공유하는 단일 스키마/파서/렌더 계약.
// (daily/monthly/saju_full/compat 는 전용 스키마 유지. 신규 텍스트 종목은 전부 이 엔진.)
// 저장은 messages.content 에 병합 JSON 문자열(v:1). 각 종목의 섹션 구성은 prompt.ts genericGuide 가 정함.

import { parseReportJson } from "./json-recover";
import type { FortuneType } from "./types";

/** 공용 섹션 엔진을 쓰는 신규 종목(2026-08-30). daily/monthly/saju_full/compat/good_days 는 전용 스키마 유지. */
export const GENERIC_FORTUNE_TYPES: readonly FortuneType[] = [
  "nature_self", "talent_path", "user_manual", "element_balance", "life_full",
  "love_self", "love_year", "marriage", "wealth_vessel", "wealth_year",
  "career_timing", "fact_bomb", "past_life", "saju_report_card", "life_graph",
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

/** AI 가 생성하는 부분 — intro + 섹션 N개 + note. */
export interface GenericReportAI {
  intro: string; // 도입부
  sections: GenericReportSection[]; // 종목별 N개 (개수는 prompt/parser 가 담당, 스키마는 배열)
  note: string; // 별콩이 한마디
}

/** OpenAI 구조화 출력 스키마 — strict. 섹션 개수는 프롬프트가 지시(스키마는 배열이라 강제 불가). */
export const GENERIC_REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intro: { type: "string" },
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
  required: ["intro", "sections", "note"],
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

  return { intro: o.intro.trim(), sections, note: o.note.trim() };
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
