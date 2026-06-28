// qa/types.ts — 하네스 전역 타입.

import type { SajuProduct } from "../lib/saju/products";
import type { SpreadType, SpreadCategory, DrawnCard } from "../lib/tarot/spreads";
import type { EmotionTag } from "../lib/emotions";
import type { ProfileInput } from "../lib/saju/profile-input";

export type ProductRef =
  | { kind: "saju"; sajuProduct: SajuProduct }
  | { kind: "tarot"; spreadType: SpreadType; spreadCategory: SpreadCategory };

export interface InputStyle {
  /** 시뮬레이터 시스템 프롬프트에 주입되는 말투 묘사 */
  tone: string;
  /** 이벤트 생성 확률을 편향하는 습관 태그 (예: "burst", "idle", "abandon") */
  habits: string[];
}

export interface Case {
  id: string;
  product: ProductRef;
  emotion: EmotionTag;
  /** reading 생성 입력 (사주=profile, 타로=drawnCards는 readings.ts가 채움) */
  seed: { profile?: ProfileInput };
  seedConcern: string;
  userPersona: string;
  inputStyle: InputStyle;
  maxTurns: number;
  expects: AssertionFlags;
}

export interface AssertionFlags {
  /** [END]로 정상 종료되어야 하는가 (abandon 케이스는 false) */
  mustEnd: boolean;
  /** 위기 시그널 헤더가 떠야 하는가 */
  expectSensitiveHeader: boolean;
  /** 타로면 기대 카드 수 (사주는 undefined → [CARD] 마커 0개여야 함) */
  expectCardCount?: number;
}

/** 시뮬레이터가 내는 이벤트 */
export type SimEvent =
  | { type: "say"; text: string }
  | { type: "burst"; texts: string[] }
  | { type: "idle_resume"; text: string }
  | { type: "abandon" }
  | { type: "stop" };

/** chat 한 콜의 기록 */
export interface TurnRecord {
  userText: string;
  assistantText: string;
  /** 이 콜에서 받은 응답 헤더 (X-Sensitive-* 등) */
  headers: Record<string, string>;
  status: number;
  /** burst/idle_resume 등 이 발화가 어떤 이벤트에서 왔는지 */
  eventType: SimEvent["type"];
}

export interface Transcript {
  caseId: string;
  product: ProductRef;
  readingId: string;
  cost: number;
  startBalance: number;
  endBalance: number;
  turns: TurnRecord[];
  /** 대화가 끝난 이유 */
  finishReason: "ended" | "abandoned" | "max_calls" | "max_turns" | "error";
  error?: string;
}

export interface AssertionResult {
  name: string;
  pass: boolean;
  detail: string;
}

export interface JudgeDimension {
  dimension: string;
  pass: boolean;
  evidence: string;
}

export interface JudgeResult {
  dimensions: JudgeDimension[];
  /** 한 차원이라도 fail이면 false */
  overallPass: boolean;
  summary: string;
}

export interface CaseResult {
  transcript: Transcript;
  assertions: AssertionResult[];
  judge: JudgeResult | null;
}
