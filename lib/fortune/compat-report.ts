// 궁합·관계 분석(compat) 전용 — AI JSON 파싱·검증 + 저장/복원.
// saju-full-report.ts 와 동형. 저장은 messages.content 에 JSON 문자열(v:1).
// 두 사람 사주는 readings.saju_data 에 별도 저장(이 모듈은 본문만 다룸).

import type { SajuResult } from "@/lib/saju/calc";
import { parseReportJson } from "./json-recover";

/** 연애·결혼 궁합(compat) 등급 5단계. AI 는 이 중 하나만 고른다. */
export const COMPAT_ROMANTIC_GRADES = [
  "천생연분",
  "찰떡궁합",
  "좋은 인연",
  "서로 배우는 인연",
  "노력이 필요한 인연",
] as const;

/** 인간 관계 궁합(compat_social) 등급 5단계 — 친구·가족·동료 전용. */
export const COMPAT_SOCIAL_GRADES = [
  "환상의 케미",
  "든든한 사이",
  "잘 맞는 사이",
  "노력하면 좋은 사이",
  "서로 다른 결",
] as const;

/** 두 상품 등급 합집합 — 파서·저장은 둘 다 허용(프롬프트가 종류별 등급을 강제). */
export const COMPAT_GRADES = [
  ...COMPAT_ROMANTIC_GRADES,
  ...COMPAT_SOCIAL_GRADES,
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
  summary: string; // 큰 그림 요약
  chemistry: string; // 오행 케미
  attraction: string; // 끌림·성격
  conflict: string; // 갈등 포인트
  communication: string; // 잘 통하는 대화법
  longterm: string; // 장기 전망
  growth: string; // 관계 성장 포인트
  // 신설 카테고리 (2026-08-30, compat 연애궁합 전용 — compat_social 은 미생성) — 구 저장본 호환 위해 optional
  individual?: string; // 두 사람 각자의 모습·역할
  stages?: string; // 관계 시기별 흐름
  repair?: string; // 다툼과 화해의 기술
  intimacy?: string; // 애정·거리감 표현법
  advice: string[]; // 관계 조언 정확히 3개
  note: string; // 별콩이의 한마디
}

/** OpenAI 구조화 출력 스키마 — CompatReportAI 미러(compat/compat_social 공유). advice 3개 규칙은 parseCompatReportJson 담당.
 *  grade enum 은 합집합 — 종류별 서브셋 강제는 프롬프트가, 파서(isGrade)도 합집합 허용이라 현행과 정합. */
export const COMPAT_REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    grade: { type: "string", enum: [...COMPAT_GRADES] },
    theme: { type: "string" },
    summary: { type: "string" },
    chemistry: { type: "string" },
    attraction: { type: "string" },
    conflict: { type: "string" },
    communication: { type: "string" },
    longterm: { type: "string" },
    growth: { type: "string" },
    advice: { type: "array", items: { type: "string" } },
    note: { type: "string" },
  },
  required: [
    "grade", "theme", "summary", "chemistry", "attraction", "conflict",
    "communication", "longterm", "growth", "advice", "note",
  ],
} as const;

/** compat(연애 궁합) 전용 확장 스키마 — 위 공유 스키마 + 신설 4카테고리(2026-08-30).
 *  compat_social(인간관계)은 비연애라 intimacy 등이 부적합 → 공유 COMPAT_REPORT_SCHEMA 유지. */
export const COMPAT_LOVE_REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    grade: { type: "string", enum: [...COMPAT_GRADES] },
    theme: { type: "string" },
    summary: { type: "string" },
    chemistry: { type: "string" },
    attraction: { type: "string" },
    conflict: { type: "string" },
    communication: { type: "string" },
    longterm: { type: "string" },
    growth: { type: "string" },
    individual: { type: "string" },
    stages: { type: "string" },
    repair: { type: "string" },
    intimacy: { type: "string" },
    advice: { type: "array", items: { type: "string" } },
    note: { type: "string" },
  },
  required: [
    "grade", "theme", "summary", "chemistry", "attraction", "conflict",
    "communication", "longterm", "growth", "individual", "stages", "repair",
    "intimacy", "advice", "note",
  ],
} as const;

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
  const o = parseReportJson(raw);
  if (!o) return null;

  if (!isGrade(o.grade)) return null;
  if (!isNonEmptyString(o.theme)) return null;
  if (!isNonEmptyString(o.summary)) return null;
  if (!isNonEmptyString(o.chemistry)) return null;
  if (!isNonEmptyString(o.attraction)) return null;
  if (!isNonEmptyString(o.conflict)) return null;
  if (!isNonEmptyString(o.communication)) return null;
  if (!isNonEmptyString(o.longterm)) return null;
  if (!isNonEmptyString(o.growth)) return null;
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
    communication: o.communication.trim(),
    longterm: o.longterm.trim(),
    growth: o.growth.trim(),
    // 신설 카테고리 — compat 만 스키마 강제, compat_social 은 없음 → optional 추출(누락해도 파싱 실패 아님)
    ...(isNonEmptyString(o.individual) ? { individual: o.individual.trim() } : {}),
    ...(isNonEmptyString(o.stages) ? { stages: o.stages.trim() } : {}),
    ...(isNonEmptyString(o.repair) ? { repair: o.repair.trim() } : {}),
    ...(isNonEmptyString(o.intimacy) ? { intimacy: o.intimacy.trim() } : {}),
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
