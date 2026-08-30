// 사주 성적표(saju_report_card) 전용 — 항목별 학점 + 코멘트. 공유성 높은 시각 카드용.
import { parseReportJson } from "./json-recover";

export interface ReportCardScore {
  domain: string; // "재물운" 등
  grade: string; // "A+" | "B0" | "C" 등 (LLM 자유)
  comment: string; // 한 줄 코멘트
}

export interface ReportCardAI {
  intro: string;
  scores: ReportCardScore[]; // 5개 도메인
  totalGrade: string; // 종합 학점
  totalComment: string; // 담임 총평
  note: string;
}

export const REPORT_CARD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intro: { type: "string" },
    scores: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          domain: { type: "string" },
          grade: { type: "string" },
          comment: { type: "string" },
        },
        required: ["domain", "grade", "comment"],
      },
    },
    totalGrade: { type: "string" },
    totalComment: { type: "string" },
    note: { type: "string" },
  },
  required: ["intro", "scores", "totalGrade", "totalComment", "note"],
} as const;

export interface ReportCardReport extends ReportCardAI {
  v: 1;
}

function ne(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function parseReportCardJson(raw: string): ReportCardAI | null {
  const o = parseReportJson(raw);
  if (!o) return null;
  if (!ne(o.intro) || !ne(o.totalGrade) || !ne(o.totalComment) || !ne(o.note)) return null;
  if (!Array.isArray(o.scores)) return null;
  const scores: ReportCardScore[] = [];
  for (const s of o.scores) {
    if (s && typeof s === "object") {
      const d = (s as Record<string, unknown>).domain;
      const g = (s as Record<string, unknown>).grade;
      const c = (s as Record<string, unknown>).comment;
      if (ne(d) && ne(g) && ne(c)) scores.push({ domain: d.trim(), grade: g.trim(), comment: c.trim() });
    }
  }
  if (scores.length === 0) return null;
  return {
    intro: o.intro.trim(),
    scores,
    totalGrade: o.totalGrade.trim(),
    totalComment: o.totalComment.trim(),
    note: o.note.trim(),
  };
}

export function buildReportCardReport(ai: ReportCardAI): ReportCardReport {
  return { v: 1, ...ai };
}
export function serializeReportCardReport(r: ReportCardReport): string {
  return JSON.stringify(r);
}
export function tryParseStoredReportCardReport(content: string): ReportCardReport | null {
  if (typeof content !== "string") return null;
  if (!content.trimStart().startsWith("{")) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(content);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (o.v !== 1 || !Array.isArray(o.scores) || !ne(o.totalGrade)) return null;
  return obj as ReportCardReport;
}
