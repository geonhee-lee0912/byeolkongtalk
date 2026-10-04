// 강제 종료선에서 닫힌 타로 대화의 재개("4턴 더"/"한 장 더") 자격 — 순수 판정
// (spec 2026-10-04-타로톡-인챗결제-대화길이 §3-4). 서버 판정의 단일 원천이고, 클라는
// stripEndFromLastAssistant 만 쓴다(재개 직후 화면 상태 정리).
import { WRAP_THRESHOLDS } from "./constants.ts";
import type { SpreadType } from "./spreads.ts";
import { CLARIFIER_MAX, EXTEND_MAX, EXTEND_TURNS } from "../upsell.ts";

/** 채팅 라우트의 effT 와 같은 식 — 기본 강제 종료선 + 연장 턴 + 보조 카드당 2턴 */
export function effectiveAbsTurnCap(
  spreadType: string,
  extraTurns: number,
  clarifierCount: number,
): number {
  const t = WRAP_THRESHOLDS[spreadType as SpreadType];
  if (!t) return Number.POSITIVE_INFINITY;
  return t.absTurnCap + extraTurns + clarifierCount * 2;
}

export function isEndedAtAbsCap(i: {
  ended: boolean;
  assistantTurns: number;
  effAbsTurnCap: number;
}): boolean {
  return i.ended && i.assistantTurns >= i.effAbsTurnCap;
}

export interface ReopenOptions {
  extend: boolean;
  clarifier: boolean;
}

export function reopenOptions(i: {
  endedAtAbsCap: boolean;
  hasSensitive: boolean;
  extraTurns: number;
  clarifierCount: number;
}): ReopenOptions {
  if (!i.endedAtAbsCap || i.hasSensitive) return { extend: false, clarifier: false };
  return {
    extend: i.extraTurns < EXTEND_TURNS * EXTEND_MAX,
    clarifier: i.clarifierCount < CLARIFIER_MAX,
  };
}

/** 재개 시 마지막 assistant 메시지 끝의 [END] 만 지운다(본문 불변) */
export function stripTrailingEnd(content: string): string {
  return content.replace(/\s*\[END\]\s*$/, "");
}

export function stripEndFromLastAssistant<T extends { role: string; content: string }>(
  messages: T[],
): T[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      const next = [...messages];
      next[i] = { ...messages[i], content: stripTrailingEnd(messages[i].content) };
      return next;
    }
  }
  return messages;
}
