// 이번달 운세(monthly) 전용 — AI JSON 파싱·검증 + 월건(결정론적) 병합 + 저장/복원.
// daily-report.ts 와 동형. monthly 리포트는 messages.content 에 병합 JSON 문자열(v:1)로 저장된다.

import type { FiveElement } from "manseryeok";
import type { TemporalLuck } from "@/lib/saju/calc";
import { DAILY_SECTIONS } from "./daily-report";
import { STEM_ELEMENT, BRANCH_ELEMENT } from "./element";

// 도메인 5개는 daily 와 동일 집합을 재사용 (아이콘/제목/순서는 DAILY_SECTIONS 가 정본).
export type MonthlySectionKey = "money" | "work" | "love" | "health" | "study";

const SECTION_KEYS: MonthlySectionKey[] = DAILY_SECTIONS.map(
  (s) => s.key as MonthlySectionKey
);

export interface MonthlyWeek {
  week: 1 | 2 | 3 | 4;
  body: string;
}

/** AI 가 생성하는 부분. */
export interface MonthlyReportAI {
  stars: number; // 1~5
  theme: string; // 이번 달 테마 한 줄
  summary: string; // 한 줄 총평
  lucky: { keyword: string; color: string }; // daily 의 time 은 월간에 부적합 → 제거
  intro: string; // 월건 두 글자 풀이
  weekly: MonthlyWeek[]; // 1~4주 고정 4개
  sections: { key: MonthlySectionKey; body: string }[]; // 5개 도메인
  timing: { good: string; caution: string }; // 주목할 시기 (정성적)
  balance: { good: string; warn: string }; // 이번 달 챙길 점
  note: string; // 별콩이 한마디
}

/** 서버가 병합하는 월건(결정론적) — temporal.month 출처. */
export interface MonthlyWolgeon {
  stem: string; // "갑"
  branch: string; // "오"
  hanja: string; // "甲午"
  stemElement: FiveElement;
  branchElement: FiveElement;
}

/** 저장/렌더 최종 형태. */
export interface MonthlyReport extends MonthlyReportAI {
  v: 1;
  wolgeon: MonthlyWolgeon;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * AI 원문에서 JSON 추출·검증. 코드펜스/잡텍스트가 섞여도 첫 '{' ~ 마지막 '}' 만 파싱.
 * 실패하거나 필수 필드 누락 시 null. 성공 시 sections 는 표준 순서, weekly 는 1~4주 순서로 반환.
 */
export function parseMonthlyReportJson(raw: string): MonthlyReportAI | null {
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

  // stars 1~5 정수로 클램프
  const starsNum = typeof o.stars === "number" ? Math.round(o.stars) : NaN;
  if (Number.isNaN(starsNum)) return null;
  const stars = Math.min(5, Math.max(1, starsNum));

  if (!isNonEmptyString(o.theme)) return null;
  if (!isNonEmptyString(o.summary)) return null;
  if (!isNonEmptyString(o.intro)) return null;
  if (!isNonEmptyString(o.note)) return null;

  const lucky = o.lucky as Record<string, unknown> | undefined;
  if (!lucky || !isNonEmptyString(lucky.keyword) || !isNonEmptyString(lucky.color))
    return null;

  const timing = o.timing as Record<string, unknown> | undefined;
  if (!timing || !isNonEmptyString(timing.good) || !isNonEmptyString(timing.caution))
    return null;

  const balance = o.balance as Record<string, unknown> | undefined;
  if (!balance || !isNonEmptyString(balance.good) || !isNonEmptyString(balance.warn))
    return null;

  // weekly — 1~4주 모두 body 존재해야 함
  if (!Array.isArray(o.weekly)) return null;
  const bodyByWeek = new Map<number, string>();
  for (const w of o.weekly) {
    if (w && typeof w === "object") {
      const week = (w as Record<string, unknown>).week;
      const body = (w as Record<string, unknown>).body;
      if (typeof week === "number" && isNonEmptyString(body)) {
        bodyByWeek.set(Math.round(week), body.trim());
      }
    }
  }
  const weekly: MonthlyWeek[] = [];
  for (const wk of [1, 2, 3, 4] as const) {
    const body = bodyByWeek.get(wk);
    if (!body) return null;
    weekly.push({ week: wk, body });
  }

  // sections — 5개 도메인 모두 존재해야 함
  if (!Array.isArray(o.sections)) return null;
  const bodyByKey = new Map<string, string>();
  for (const s of o.sections) {
    if (s && typeof s === "object") {
      const key = (s as Record<string, unknown>).key;
      const body = (s as Record<string, unknown>).body;
      if (typeof key === "string" && isNonEmptyString(body)) {
        bodyByKey.set(key, body.trim());
      }
    }
  }
  const sections: { key: MonthlySectionKey; body: string }[] = [];
  for (const key of SECTION_KEYS) {
    const body = bodyByKey.get(key);
    if (!body) return null;
    sections.push({ key, body });
  }

  return {
    stars,
    theme: o.theme.trim(),
    summary: o.summary.trim(),
    lucky: { keyword: lucky.keyword.trim(), color: lucky.color.trim() },
    intro: o.intro.trim(),
    weekly,
    sections,
    timing: { good: timing.good.trim(), caution: timing.caution.trim() },
    balance: { good: balance.good.trim(), warn: balance.warn.trim() },
    note: o.note.trim(),
  };
}

/** AI JSON + 이번 달 월건 → 저장 최종본. temporal.month(PillarLite) 사용. */
export function buildMonthlyReport(
  ai: MonthlyReportAI,
  temporal: TemporalLuck
): MonthlyReport {
  const m = temporal.month;
  return {
    v: 1,
    ...ai,
    wolgeon: {
      stem: m.stem,
      branch: m.branch,
      hanja: m.hanja,
      stemElement: STEM_ELEMENT[m.stem] ?? m.element,
      branchElement: BRANCH_ELEMENT[m.branch] ?? m.element,
    },
  };
}

/** 저장본 직렬화. */
export function serializeMonthlyReport(report: MonthlyReport): string {
  return JSON.stringify(report);
}

/**
 * messages.content 가 monthly 저장본(v:1 JSON)이면 파싱, 아니면(legacy 줄글) null.
 */
export function tryParseStoredMonthlyReport(content: string): MonthlyReport | null {
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
  if (!o.wolgeon || typeof o.wolgeon !== "object") return null;
  if (!Array.isArray(o.weekly)) return null;
  if (!Array.isArray(o.sections)) return null;
  return obj as MonthlyReport;
}
