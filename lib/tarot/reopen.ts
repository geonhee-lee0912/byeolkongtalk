// 강제 종료선에서 닫힌 타로 대화의 재개("4턴 더"/"한 장 더") 자격 — 순수 판정
// (spec 2026-10-04-타로톡-인챗결제-대화길이 §3-4). 서버 판정의 단일 원천이고, 클라는
// stripEndFromLastAssistant 만 쓴다(재개 직후 화면 상태 정리).
import { effectiveWrapThresholds } from "./thresholds.ts";
import { CLARIFIER_MAX, EXTEND_MAX, EXTEND_TURNS } from "../upsell.ts";

/** 유효 강제 종료선 — 채팅 라우트와 같은 식(./thresholds.ts 단일 원천): 기본선 + 연장 턴 + 보조 카드당 2턴. 모르는 스프레드는 무한대(재개 대상 아님) */
export function effectiveAbsTurnCap(
  spreadType: string,
  extraTurns: number,
  clarifierCount: number,
): number {
  return effectiveWrapThresholds(spreadType, extraTurns, clarifierCount)?.absTurnCap ?? Number.POSITIVE_INFINITY;
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

/** X-Reopen 응답 헤더 값(서버가 만들고 클라가 읽는 한 쌍 — spec §3-4). 가능한 상품만 쉼표로: "extend,clarifier" · "extend" · "clarifier" · "" (강제 종료선 종료지만 재개 상품 없음) */
export function formatReopenHeader(ro: ReopenOptions): string {
  return [ro.extend ? "extend" : "", ro.clarifier ? "clarifier" : ""].filter(Boolean).join(",");
}

/** X-Reopen 헤더 읽기 — null(헤더 없음) = 강제 종료선 종료가 아님, "" = 종료지만 재개 상품 없음. 모르는 토큰·빈 토큰은 무시한다(서버가 상품을 늘려도 옛 클라가 안 깨진다) */
export function parseReopenHeader(v: string | null): ReopenOptions | null {
  if (v === null) return null;
  const tokens = v.split(",").map((t) => t.trim());
  return { extend: tokens.includes("extend"), clarifier: tokens.includes("clarifier") };
}

/** 재개 시 마지막 assistant 메시지의 끝 [END] 와 그 주변 공백만 지운다(중간의 [END]·그 밖의 본문은 그대로) */
export function stripTrailingEnd(content: string): string {
  return content.replace(/\s*\[END\]\s*$/, "");
}

/** 클라 전용 — 재개 직후 화면 상태 정리: 마지막 assistant 메시지에서 [END] 를 위치·대소문자와 상관없이 **전부** 지우고 끝 공백을 다듬는다.
 *  서버 저장본은 [END] 가 끝에 하나뿐일 때만 재개되지만(tarotEndState·stripTrailingEnd), 클라가 스트리밍으로 들고 있는 사본엔 본문 중간의
 *  [END] 가 남아 있을 수 있다. 하나라도 남으면 클라(lib/tarot/bubbles.ts END_MARKER_REGEX, 대소문자 무시)가 여전히 '끝남'으로 보고
 *  입력창이 안 열리며, 그 [END] 가 이력으로 모델에 되돌아간다. */
export function stripEndFromLastAssistant<T extends { role: string; content: string }>(
  messages: T[],
): T[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      const next = [...messages];
      next[i] = { ...messages[i], content: messages[i].content.replace(/\[END\]/gi, "").trimEnd() };
      return next;
    }
  }
  return messages;
}

/** 대소문자 무시 [END] 검사 — 클라가 그렇게 감지하므로(lib/tarot/bubbles.ts END_MARKER_REGEX) 재개 후 '남은 [END]' 도 같은 기준으로 본다 */
const hasEndToken = (s: string): boolean => /\[END\]/i.test(s);

/** stripTrailingEnd 가 [END] 를 실제로 전부 없앨 수 있는 모양인가 — [END] 가 대화 전체에서 딱 하나이고 마지막 메시지의 끝에 있을 때만.
 *  그 밖(끝 뒤에 다른 글자 · [END] 중복)이면 재개 UPDATE 가 성공해도 [END] 가 남아 차감만 되고 대화는 닫힌 채다.
 *  (b)(c) 는 대소문자를 무시한다 — 소문자 [end] 가 남으면 서버 검사는 통과해도 새로고침 때 클라가 다시 닫힌 것으로 본다. 비어 있지 않은 배열 전제. */
function isReopenableByStrip(assistantContents: string[]): boolean {
  const last = assistantContents[assistantContents.length - 1];
  const stripped = stripTrailingEnd(last);
  return (
    stripped !== last && // (a) 마지막 메시지가 끝 [END] 로 닫힌다
    !hasEndToken(stripped) && // (b) 같은 메시지에 [END] 가 더 없다
    !assistantContents.slice(0, -1).some(hasEndToken) // (c) 앞선 메시지에도 없다
  );
}

/** 재개 판정에 쓰는 readings 행. ⚠️ 라우트의 reading 은 untyped client 의 any 라 select 에서 컬럼을 빠뜨려도 타입 오류가 안 난다
 *  → loadTarotEndState 가 런타임에 undefined(=select 안 함)를 막는다. null 은 DB 값이라 정상. */
export interface ReopenReadingRow {
  id: string;
  consultation_type: string | null;
  spread_type: string | null;
  extra_turns: number | null;
  clarifier_count: number | null;
}

/** 저장된 assistant 메시지(시간순)로 본 종료 상태 — 구매 라우트·GET 공용 판정의 단일 원천. 타로가 아니면(consultation_type) endedAtAbsCap 은 항상 false.
 *  reading 의 extra_turns/clarifier_count 는 **구매 반영 전** 값이어야 한다(반영 후 값이면 유효 강제 종료선이 올라가 재개 자격이 조용히 꺼진다). */
export function tarotEndState(
  assistantContents: string[],
  reading: ReopenReadingRow,
): { ended: boolean; endedAtAbsCap: boolean } {
  const ended = assistantContents.some((c) => c.includes("[END]"));
  const spreadType = reading.consultation_type === "tarot" ? reading.spread_type : null;
  if (!ended || spreadType == null) return { ended, endedAtAbsCap: false };
  const atAbsCap = isEndedAtAbsCap({
    ended,
    assistantTurns: assistantContents.length,
    effAbsTurnCap: effectiveAbsTurnCap(spreadType, reading.extra_turns ?? 0, reading.clarifier_count ?? 0),
  });
  return { ended, endedAtAbsCap: atAbsCap && isReopenableByStrip(assistantContents) };
}
