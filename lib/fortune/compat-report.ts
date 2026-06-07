// 궁합·관계 분석(compat) 전용 — AI JSON 파싱·검증 + 저장/복원.
// saju-full-report.ts 와 동형. 저장은 messages.content 에 JSON 문자열(v:1).
// 두 사람 사주는 readings.saju_data 에 별도 저장(이 모듈은 본문만 다룸).

import type { SajuResult } from "@/lib/saju/calc";

/** 정성 등급 5단계 (고정 enum). AI 는 이 중 하나만 고른다. */
export const COMPAT_GRADES = [
  "천생연분",
  "찰떡궁합",
  "좋은 인연",
  "서로 배우는 인연",
  "노력이 필요한 인연",
] as const;
export type CompatGrade = (typeof COMPAT_GRADES)[number];

/** readings.saju_data 에 저장되는 두 사람 사주 쌍. */
export interface CompatSajuPair {
  a: SajuResult;
  b: SajuResult;
  names: { a: string; b: string };
}

/** AI 가 생성하는 부분. */
export interface CompatReportAI {
  grade: CompatGrade;
  theme: string; // 관계 한 줄 테마
  summary: string; // 큰 그림 요약 3~4문장
  chemistry: string; // 오행 케미 5~6문장
  attraction: string; // 끌림·성격 4~5문장
  conflict: string; // 갈등 포인트 4~5문장
  longterm: string; // 장기 전망 4~5문장
  advice: string[]; // 관계 조언 정확히 3개
  note: string; // 별콩이의 한마디 2~3문장
}

/** 저장/렌더 최종 형태. */
export interface CompatReport extends CompatReportAI {
  v: 1;
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

function isGrade(v: unknown): v is CompatGrade {
  return typeof v === "string" && (COMPAT_GRADES as readonly string[]).includes(v);
}

/**
 * AI 원문에서 JSON 추출·검증. 코드펜스/잡텍스트가 섞여도 첫 '{' ~ 마지막 '}' 만 파싱.
 * 실패하거나 필수 필드 누락 시 null.
 */
export function parseCompatReportJson(raw: string): CompatReportAI | null {
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

  if (!isGrade(o.grade)) return null;
  if (!isNonEmptyString(o.theme)) return null;
  if (!isNonEmptyString(o.summary)) return null;
  if (!isNonEmptyString(o.chemistry)) return null;
  if (!isNonEmptyString(o.attraction)) return null;
  if (!isNonEmptyString(o.conflict)) return null;
  if (!isNonEmptyString(o.longterm)) return null;
  if (!isNonEmptyString(o.note)) return null;

  const advice = cleanStringArray(o.advice, 3, 3);
  if (!advice) return null;

  return {
    grade: o.grade,
    theme: o.theme.trim(),
    summary: o.summary.trim(),
    chemistry: o.chemistry.trim(),
    attraction: o.attraction.trim(),
    conflict: o.conflict.trim(),
    longterm: o.longterm.trim(),
    advice,
    note: o.note.trim(),
  };
}

/** AI JSON → 저장 최종본. */
export function buildCompatReport(ai: CompatReportAI): CompatReport {
  return { v: 1, ...ai };
}

/** 저장본 직렬화. */
export function serializeCompatReport(report: CompatReport): string {
  return JSON.stringify(report);
}

/**
 * messages.content 가 compat 저장본(v:1 JSON)이면 파싱, 아니면 null.
 */
export function tryParseStoredCompatReport(content: string): CompatReport | null {
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
  if (typeof o.grade !== "string") return null;
  if (!Array.isArray(o.advice)) return null;
  return obj as CompatReport;
}
