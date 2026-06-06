// 오늘의 운세(daily) 전용 — AI JSON 파싱·검증 + 일진 계산값 병합 + 저장/복원.
// daily 리포트는 messages.content 에 "병합된 JSON 문자열"(v:1)로 저장된다.
// monthly·saju_full 은 기존 마크다운 그대로라 이 모듈을 쓰지 않는다.

import type { FiveElement } from "manseryeok";
import type { TemporalLuck } from "@/lib/saju/calc";
import { ELEMENT_COLOR, STEM_ELEMENT, BRANCH_ELEMENT } from "./element";

// DailyReportCard 등 기존 사용처(@/lib/fortune/daily-report 에서 import)가 깨지지 않게 re-export.
export { ELEMENT_COLOR };

export type DailySectionKey = "money" | "work" | "love" | "health" | "study";

export interface DailySectionMeta {
  key: DailySectionKey;
  title: string;
  icon: string;
}

/** 도메인 섹션 — 제목/아이콘/순서는 코드 고정 (AI 는 key 별 body 만 채움). */
export const DAILY_SECTIONS: DailySectionMeta[] = [
  { key: "money", title: "재물운", icon: "💰" },
  { key: "work", title: "직장 · 업무운", icon: "💼" },
  { key: "love", title: "애정 · 관계운", icon: "💗" },
  { key: "health", title: "건강 · 멘탈운", icon: "🌿" },
  { key: "study", title: "학업 · 문서 · 이동운", icon: "📄" },
];

const SECTION_KEYS: DailySectionKey[] = DAILY_SECTIONS.map((s) => s.key);

/** AI 가 생성하는 부분. */
export interface DailyReportAI {
  stars: number; // 1~5
  summary: string;
  lucky: { keyword: string; color: string; time: string };
  intro: string;
  sections: { key: DailySectionKey; body: string }[];
  balance: { good: string; warn: string };
  note: string;
}

/** 서버가 병합하는 일진(결정론적). */
export interface DailyReportIljin {
  stem: string; // "갑"
  branch: string; // "자"
  hanja: string; // "甲子"
  stemElement: FiveElement;
  branchElement: FiveElement;
}

/** 저장/렌더 최종 형태. */
export interface DailyReport extends DailyReportAI {
  v: 1;
  iljin: DailyReportIljin;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * AI 원문에서 JSON 추출·검증. 코드펜스/잡텍스트가 섞여도 첫 '{' ~ 마지막 '}' 만 파싱.
 * 실패하거나 필수 필드 누락 시 null. 성공 시 sections 는 표준 순서로 정렬해서 반환.
 */
export function parseDailyReportJson(raw: string): DailyReportAI | null {
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

  if (!isNonEmptyString(o.summary)) return null;
  if (!isNonEmptyString(o.intro)) return null;
  if (!isNonEmptyString(o.note)) return null;

  const lucky = o.lucky as Record<string, unknown> | undefined;
  if (
    !lucky ||
    !isNonEmptyString(lucky.keyword) ||
    !isNonEmptyString(lucky.color) ||
    !isNonEmptyString(lucky.time)
  )
    return null;

  const balance = o.balance as Record<string, unknown> | undefined;
  if (!balance || !isNonEmptyString(balance.good) || !isNonEmptyString(balance.warn))
    return null;

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
  const sections: { key: DailySectionKey; body: string }[] = [];
  for (const key of SECTION_KEYS) {
    const body = bodyByKey.get(key);
    if (!body) return null; // 5개 도메인 전부 있어야 함
    sections.push({ key, body });
  }

  return {
    stars,
    summary: o.summary.trim(),
    lucky: {
      keyword: lucky.keyword.trim(),
      color: lucky.color.trim(),
      time: lucky.time.trim(),
    },
    intro: o.intro.trim(),
    sections,
    balance: { good: balance.good.trim(), warn: balance.warn.trim() },
    note: o.note.trim(),
  };
}

/** AI JSON + 오늘의 일진 → 저장 최종본. */
export function buildDailyReport(ai: DailyReportAI, temporal: TemporalLuck): DailyReport {
  const d = temporal.day;
  return {
    v: 1,
    ...ai,
    iljin: {
      stem: d.stem,
      branch: d.branch,
      hanja: d.hanja,
      stemElement: STEM_ELEMENT[d.stem] ?? d.element,
      branchElement: BRANCH_ELEMENT[d.branch] ?? d.element,
    },
  };
}

/** 저장본 직렬화. */
export function serializeDailyReport(report: DailyReport): string {
  return JSON.stringify(report);
}

/**
 * messages.content 가 daily 저장본(v:1 JSON)이면 파싱, 아니면(legacy 줄글) null.
 */
export function tryParseStoredDailyReport(content: string): DailyReport | null {
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
  if (!o.iljin || typeof o.iljin !== "object") return null;
  if (!Array.isArray(o.sections)) return null;
  return obj as DailyReport;
}
