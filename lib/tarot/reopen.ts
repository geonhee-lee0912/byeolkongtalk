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

/** 재개 시 마지막 assistant 메시지의 끝 [END] 와 그 주변 공백만 지운다(중간의 [END]·그 밖의 본문은 그대로) */
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

/** stripTrailingEnd 가 [END] 를 실제로 전부 없앨 수 있는 모양인가 — [END] 가 대화 전체에서 딱 하나이고 마지막 메시지의 끝에 있을 때만.
 *  그 밖(끝 뒤에 다른 글자 · [END] 중복)이면 재개 UPDATE 가 성공해도 [END] 가 남아 차감만 되고 대화는 닫힌 채다. 비어 있지 않은 배열 전제. */
function isReopenableByStrip(assistantContents: string[]): boolean {
  const last = assistantContents[assistantContents.length - 1];
  const stripped = stripTrailingEnd(last);
  return (
    stripped !== last && // (a) 마지막 메시지가 끝 [END] 로 닫힌다
    !stripped.includes("[END]") && // (b) 같은 메시지에 [END] 가 더 없다
    !assistantContents.slice(0, -1).some((c) => c.includes("[END]")) // (c) 앞선 메시지에도 없다
  );
}

/** 저장된 assistant 메시지(시간순)로 본 종료 상태 — 구매 라우트·GET 공용 판정의 단일 원천.
 *  extraTurns/clarifierCount 는 **구매 반영 전** 값이어야 한다(반영 후 값이면 유효 강제 종료선이 올라가 재개 자격이 조용히 꺼진다). */
export function tarotEndState(
  assistantContents: string[],
  spreadType: string | null,
  extraTurns: number,
  clarifierCount: number,
): { ended: boolean; endedAtAbsCap: boolean } {
  const ended = assistantContents.some((c) => c.includes("[END]"));
  if (!ended || spreadType == null) return { ended, endedAtAbsCap: false };
  const atAbsCap = isEndedAtAbsCap({
    ended,
    assistantTurns: assistantContents.length,
    effAbsTurnCap: effectiveAbsTurnCap(spreadType, extraTurns, clarifierCount),
  });
  return { ended, endedAtAbsCap: atAbsCap && isReopenableByStrip(assistantContents) };
}
