// 내 인생 그래프(life_graph) 전용 — 대운(결정론 나이 구간) × LLM 흐름 점수로 인생 곡선.
import { parseReportJson } from "./json-recover";

export interface LifeGraphDecade {
  ageLabel: string; // "32~41세" (대운 표 기반)
  score: number; // 0~100 흐름 점수 (LLM 해석)
  headline: string; // 한 줄
  body: string; // 그 구간 설명
}

export interface LifeGraphAI {
  intro: string;
  decades: LifeGraphDecade[];
  peak: string; // 최고의 시기 서술
  valley: string; // 웅크리는 시기 서술
  note: string;
}

export const LIFE_GRAPH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intro: { type: "string" },
    decades: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          ageLabel: { type: "string" },
          score: { type: "number" },
          headline: { type: "string" },
          body: { type: "string" },
        },
        required: ["ageLabel", "score", "headline", "body"],
      },
    },
    peak: { type: "string" },
    valley: { type: "string" },
    note: { type: "string" },
  },
  required: ["intro", "decades", "peak", "valley", "note"],
} as const;

export interface LifeGraphReport extends LifeGraphAI {
  v: 1;
}

function ne(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function parseLifeGraphJson(raw: string): LifeGraphAI | null {
  const o = parseReportJson(raw);
  if (!o) return null;
  if (!ne(o.intro) || !ne(o.peak) || !ne(o.valley) || !ne(o.note)) return null;
  if (!Array.isArray(o.decades)) return null;
  const decades: LifeGraphDecade[] = [];
  for (const d of o.decades) {
    if (d && typeof d === "object") {
      const a = (d as Record<string, unknown>).ageLabel;
      const sc = (d as Record<string, unknown>).score;
      const h = (d as Record<string, unknown>).headline;
      const b = (d as Record<string, unknown>).body;
      const score = typeof sc === "number" ? Math.max(0, Math.min(100, Math.round(sc))) : NaN;
      if (ne(a) && !Number.isNaN(score) && ne(h) && ne(b)) {
        decades.push({ ageLabel: a.trim(), score, headline: h.trim(), body: b.trim() });
      }
    }
  }
  if (decades.length === 0) return null;
  return { intro: o.intro.trim(), decades, peak: o.peak.trim(), valley: o.valley.trim(), note: o.note.trim() };
}

export function buildLifeGraphReport(ai: LifeGraphAI): LifeGraphReport {
  return { v: 1, ...ai };
}
export function serializeLifeGraphReport(r: LifeGraphReport): string {
  return JSON.stringify(r);
}
export function tryParseStoredLifeGraphReport(content: string): LifeGraphReport | null {
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
  if (o.v !== 1 || !Array.isArray(o.decades)) return null;
  return obj as LifeGraphReport;
}
