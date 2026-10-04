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

/**
 * '한 장 더'(보조 카드)로 강제 종료선에서 다시 연 직후의 카드 풀이 턴인가 — 그 턴만 모드와 무관하게 열어 두기 가이드를 쓴다(사용자 결정 2026-10-04 ⑦).
 * 연장(4턴 더)을 산 리딩은 자연 마무리선이 강제 종료선과 같아(③) 이 턴이 abs−1(마지막 수렴 턴)이 돼 얇은 정리 톤을 받는다 — 유료 카드 풀이가 빈약해지는 걸 막는다.
 * 구매로 강제 종료선이 +2 오르므로 이 턴의 assistantTurnsSoFar 는 '구매 전 강제 종료선' = effectiveAbsTurnCap(.., clarifierCount − 1) 이다.
 * 이 함수는 턴 수만 본다 — 보조 카드를 대화 중에 일찍 산 리딩이 나중에 그 턴 수(구매 전 선)를 지날 때도 참이므로, 채팅 라우트는
 * 이 턴의 유저 말이 구매 직후 클라가 보낸 synthetic 메시지인지(isClarifierSyntheticMessage, ./clarifier-message.ts)를 함께 확인한다.
 */
export function isClarifierReopenTurn(i: {
  spreadType: string;
  extraTurns: number;
  clarifierCount: number;
  assistantTurnsSoFar: number;
}): boolean {
  return (
    i.clarifierCount > 0 &&
    i.assistantTurnsSoFar === effectiveAbsTurnCap(i.spreadType, i.extraTurns, i.clarifierCount - 1)
  );
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

/** 저장된 assistant 메시지(시간순)로 본 종료 상태 — 구매 라우트·GET 공용 판정의 단일 원천. 타로가 아니면(consultation_type) endedAtAbsCap·claimInProgress 는 항상 false.
 *  reading 의 extra_turns/clarifier_count 는 **구매 반영 전** 값이어야 한다(반영 후 값이면 유효 강제 종료선이 올라가 재개 자격이 조용히 꺼진다).
 *
 *  claimInProgress — 끝나지 않았는데([END] 없음) 턴 수가 이미 유효 강제 종료선 이상이다. 정상 대화는 강제 종료선 턴이 [END] 로 닫히므로
 *  이 상태는 (1) 다른 구매 요청이 [END] 를 선점해 진행 중이거나 (2) 복원이 실패한 뒤에만 생긴다(후자는 무료 한 턴 뒤 스스로 풀린다).
 *  구매 라우트는 이때 409 로 돌려보낸다 — 이 요청이 '열린 대화'로 보고 선점 없이 진행하면, 선점한 쪽이 실패해 [END] 를 되살릴 때 이 요청의 구매를 덮는다.
 *  (위기 has_sensitive 리딩은 강제 종료선을 넘어도 [END] 가 안 붙지만 구매 라우트가 그보다 앞서 403 으로 거른다.) */
export function tarotEndState(
  assistantContents: string[],
  reading: ReopenReadingRow,
): { ended: boolean; endedAtAbsCap: boolean; claimInProgress: boolean } {
  const ended = assistantContents.some((c) => c.includes("[END]"));
  const spreadType = reading.consultation_type === "tarot" ? reading.spread_type : null;
  if (spreadType == null) return { ended, endedAtAbsCap: false, claimInProgress: false };
  const assistantTurns = assistantContents.length;
  const effAbsTurnCap = effectiveAbsTurnCap(spreadType, reading.extra_turns ?? 0, reading.clarifier_count ?? 0);
  if (!ended) return { ended, endedAtAbsCap: false, claimInProgress: assistantTurns >= effAbsTurnCap };
  const atAbsCap = isEndedAtAbsCap({ ended, assistantTurns, effAbsTurnCap });
  return { ended, endedAtAbsCap: atAbsCap && isReopenableByStrip(assistantContents), claimInProgress: false };
}
