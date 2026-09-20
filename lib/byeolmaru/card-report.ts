// lib/byeolmaru/card-report.ts — 별마루 유료 "오늘 타로" 7블록 리포트: 타입·구조화 출력 스키마·파서·빌더(순수).
// 스펙 2026-09-19 §6-2 "오늘 타로(신규 7블록)". 형제 = lib/fortune/daily-report.ts(오늘 사주, 같은 규율).
// 🔴 파싱·검증·게이지 병합은 **저장 전에 한 번만**(§11-1-4). 캐시 히트는 isCardReport 로 형태만 확인해 그대로 돌려준다.
import { parseReportJson } from "@/lib/fortune/json-recover";
import { stripNoteHeading } from "@/lib/fortune/note-heading";
import type { CardGauge } from "./card-gauge.ts";

export interface CardReportBlockMeta {
  key: string;
  title: string;
  icon: string;
  /** 프롬프트 문장 예산(문장 수). 목표 글자수 = 문장 × 50. */
  sentences: number;
}

/** 7블록 — 제목·아이콘·순서는 코드 고정(AI 는 key 별 body 만 채운다). note 는 다크 카드로 그려져 아이콘 없음.
 *  `as const satisfies` — `as const` 로 리터럴·deep-readonly 를 지키면서 `satisfies` 로 구조를
 *  검사한다(타입 주석이었다면 deep-readonly 가 풀려 `sentences = 99` 같은 대입이 컴파일된다). */
// 🔴 P6-2 Task10(2026-09-20) 실측 조정 — scripts/p6-2-length-probe.ts 로 4장(메이저 2·마이너 2) 실측:
// caution·move 는 "하나만/장면으로"처럼 재료가 좁아 4문장 지시에도 실제로는 목표(스펙 §6-2 글자수
// 고정값 — caution/move 200, note 150) 대비 -20~-38%로 짧게 나왔다(3~4/4 샘플에서 재현) → 5문장으로
// +1. note 도 짧게(2/4 -22~-30%) 나와 4문장으로 +1. 재실측(2회차) 결과 셋 다 스펙 고정 목표 기준
// ±15% 안으로 해소 확인(caution +9%·move 평균+10%(28칸 중 1칸만 +18.5%)·note +3%) — 조정은
// 이번 1회만, 추가 조정 불필요. 🔴 스펙 §6-2 표의 "문장" 열(caution/move 4, note 3)은 이제 실제
// (5/5/4)와 다르다 — **글자수 목표가 정본이고 문장 수는 그 목표에 도달하기 위해 실측으로 조정한
// 수단**이다. 문장 수를 표에 맞춰 되돌리지 말 것(그러면 다시 -20~-38% 부족으로 돌아간다).
export const CARD_REPORT_BLOCKS = [
  { key: "place", title: "이 카드가 온 자리", icon: "🃏", sentences: 8 },
  { key: "love", title: "오늘 애정 · 관계", icon: "💗", sentences: 6 },
  { key: "work", title: "오늘 일 · 돈", icon: "💼", sentences: 6 },
  { key: "mind", title: "카드가 비추는 마음", icon: "🌙", sentences: 5 },
  { key: "caution", title: "오늘 조심할 하나", icon: "⚠️", sentences: 5 },
  { key: "move", title: "오늘의 한 수", icon: "✨", sentences: 5 },
  { key: "note", title: "별콩이의 한마디", icon: "", sentences: 4 },
] as const satisfies readonly CardReportBlockMeta[];

/** key 유니온은 배열에서 역산 — 유니온에 키를 추가하고 배열에 잊으면(또는 반대로) 여기서 어긋나
 *  타입 에러가 난다(예전엔 별도 유니온 리터럴이라 두 쪽이 따로 놀 수 있었다). */
export type CardReportBlockKey = (typeof CARD_REPORT_BLOCKS)[number]["key"];

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

/** 포맷 버전 — 게이지 폭(card-gauge.ts DOMAIN_DELTA/ALL_DELTA)이나 블록 구성을 바꾸면 올릴 것.
 *  interface·buildCardReport·isCardReport 3곳이 전부 이 상수 하나만 참조하므로, 올리는 순간
 *  세 곳이 자동으로 같이 움직인다(예전엔 리터럴 `1`이 3곳에 흩어져 있어 한 곳만 고치면
 *  나머지는 tsc 도 못 잡고 조용히 stale 로 남았다). */
const CARD_REPORT_V = 1;

/** 저장/렌더 최종 형태(byeolmaru_card_narrative.report JSONB). v 는 포맷 버전 — 바꾸면 구행은 미스로 취급된다. */
export interface CardReport {
  v: typeof CARD_REPORT_V;
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
  return { v: CARD_REPORT_V, cardId: ctx.cardId, reversed: ctx.reversed, gauge: ctx.gauge, blocks: ai };
}

function isGaugeAxis(v: unknown): boolean {
  return !!v && typeof v === "object" && typeof (v as { base?: unknown }).base === "number" && typeof (v as { delta?: unknown }).delta === "number";
}

/** 캐시(JSONB)에서 읽은 값이 현재 포맷의 CardReport 인가. 버전·7블록·게이지 3축을 본다. */
export function isCardReport(v: unknown): v is CardReport {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (o.v !== CARD_REPORT_V) return false;
  if (typeof o.cardId !== "number" || typeof o.reversed !== "boolean") return false;
  const g = o.gauge as Record<string, unknown> | undefined;
  if (!g || !isGaugeAxis(g.love) || !isGaugeAxis(g.money) || !isGaugeAxis(g.work)) return false;
  const b = o.blocks as Record<string, unknown> | undefined;
  if (!b) return false;
  return BLOCK_KEYS.every((k) => isNonEmptyString(b[k]));
}
