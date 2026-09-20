// lib/byeolmaru/card-report.ts — 별마루 유료 "오늘 타로" 7블록 리포트: 타입·구조화 출력 스키마·파서·빌더(순수).
// 스펙 2026-09-19 §6-2 "오늘 타로(신규 7블록)". 형제 = lib/fortune/daily-report.ts(오늘 사주, 같은 규율).
// 🔴 파싱·검증·게이지 병합은 **저장 전에 한 번만**(§11-1-4). 캐시 히트는 isCardReport 로 형태만 확인해 그대로 돌려준다.
import { parseReportJson } from "@/lib/fortune/json-recover";
import { stripNoteHeading } from "@/lib/fortune/note-heading";
import type { CardGauge } from "./card-gauge.ts";

export type CardReportBlockKey = "place" | "love" | "work" | "mind" | "caution" | "move" | "note";

export interface CardReportBlockMeta {
  key: CardReportBlockKey;
  title: string;
  icon: string;
  /** 프롬프트 문장 예산(문장 수). 목표 글자수 = 문장 × 50. */
  sentences: number;
}

/** 7블록 — 제목·아이콘·순서는 코드 고정(AI 는 key 별 body 만 채운다). note 는 다크 카드로 그려져 아이콘 없음. */
export const CARD_REPORT_BLOCKS: readonly CardReportBlockMeta[] = [
  { key: "place", title: "이 카드가 온 자리", icon: "🃏", sentences: 8 },
  { key: "love", title: "오늘 애정 · 관계", icon: "💗", sentences: 6 },
  { key: "work", title: "오늘 일 · 돈", icon: "💼", sentences: 6 },
  { key: "mind", title: "카드가 비추는 마음", icon: "🌙", sentences: 5 },
  { key: "caution", title: "오늘 조심할 하나", icon: "⚠️", sentences: 4 },
  { key: "move", title: "오늘의 한 수", icon: "✨", sentences: 4 },
  { key: "note", title: "별콩이의 한마디", icon: "", sentences: 3 },
] as const;

const BLOCK_KEYS: readonly CardReportBlockKey[] = CARD_REPORT_BLOCKS.map((b) => b.key);

/** AI 가 채우는 부분 — 7개 문자열. */
export type CardReportAI = Record<CardReportBlockKey, string>;

/** OpenAI 구조화 출력 스키마(strict). 형태만 강제 — 문장 수·내용은 프롬프트 + 파서 몫. */
export const CARD_REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    place: { type: "string" },
    love: { type: "string" },
    work: { type: "string" },
    mind: { type: "string" },
    caution: { type: "string" },
    move: { type: "string" },
    note: { type: "string" },
  },
  required: ["place", "love", "work", "mind", "caution", "move", "note"],
} as const;

/** 저장/렌더 최종 형태(byeolmaru_card_narrative.report JSONB). v 는 포맷 버전 — 바꾸면 구행은 미스로 취급된다. */
export interface CardReport {
  v: 1;
  cardId: number;
  reversed: boolean;
  gauge: CardGauge;
  blocks: CardReportAI;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** AI 원문 → 검증된 7블록. 하나라도 비면 null(부분 리포트를 저장하지 않는다). */
export function parseCardReportJson(raw: string): CardReportAI | null {
  const o = parseReportJson(raw);
  if (!o) return null;
  const out = {} as CardReportAI;
  for (const k of BLOCK_KEYS) {
    const v = o[k];
    if (!isNonEmptyString(v)) return null;
    out[k] = k === "note" ? stripNoteHeading(v) : v.trim();
  }
  return out;
}

export function buildCardReport(
  ai: CardReportAI,
  ctx: { cardId: number; reversed: boolean; gauge: CardGauge }
): CardReport {
  return { v: 1, cardId: ctx.cardId, reversed: ctx.reversed, gauge: ctx.gauge, blocks: ai };
}

function isGaugeAxis(v: unknown): boolean {
  return !!v && typeof v === "object" && typeof (v as { base?: unknown }).base === "number" && typeof (v as { delta?: unknown }).delta === "number";
}

/** 캐시(JSONB)에서 읽은 값이 현재 포맷의 CardReport 인가. 버전·7블록·게이지 3축을 본다. */
export function isCardReport(v: unknown): v is CardReport {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (o.v !== 1) return false;
  if (typeof o.cardId !== "number" || typeof o.reversed !== "boolean") return false;
  const g = o.gauge as Record<string, unknown> | undefined;
  if (!g || !isGaugeAxis(g.love) || !isGaugeAxis(g.money) || !isGaugeAxis(g.work)) return false;
  const b = o.blocks as Record<string, unknown> | undefined;
  if (!b) return false;
  return BLOCK_KEYS.every((k) => isNonEmptyString(b[k]));
}
