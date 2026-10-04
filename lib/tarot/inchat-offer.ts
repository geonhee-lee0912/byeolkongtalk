// 대화 중 '카드 한 장 더' 하이브리드 + 자연 마무리선 keep-open 의 순수 판정·후처리
// (spec 2026-10-04-타로톡-인챗결제-대화길이 §3-3·§3-5). 라우트는 이 함수들을 부르기만 한다.

import { parseAllRecoMarkers } from "../reco-utils.ts";

export const CLARIFIER_MARKER = "[RECO:tarot:clarifier]";

// 마커 유무는 클라가 칩을 띄우는 기준(parseAllRecoMarkers — 대소문자 무시)과 같은 눈으로 본다.
// 정확 문자열 비교는 "[RECO:Tarot:Clarifier]" 를 놓쳐, 칩은 뜨는데 '대화당 1회' 에는 안 세어진다.
const hasClarifierMarker = (text: string): boolean => parseAllRecoMarkers(text).includes("tarot:clarifier");

type WrapModeLike = "free" | "converge" | "hardcap";

export interface ClarifierCandidateInput {
  assistantTurnsSoFar: number;
  wrapMode: WrapModeLike;
  crisisActive: boolean;
  forceEnd: boolean;
  clarifierCount: number;
  pastAssistantTexts: string[];
  /** classifyUserTurn(이번 유저 말).asking */
  userAsking: boolean;
  /**
   * computeTurnSignals().userShortStreak — 유저 단답 2연속(턴 마무리 '정리').
   * 코어 페르소나가 지친 신호로 보는 구간이라 이때는 유료 카드를 권하지 않는다(사용자 결정 2026-10-04).
   */
  userShortStreak: boolean;
}

/** 서버가 고르는 '한 장 더' 후보 턴 — 최종 제안 여부는 별콩이가 기준을 보고 정한다 */
export function isClarifierCandidate(i: ClarifierCandidateInput): boolean {
  if (i.assistantTurnsSoFar < 1) return false; // 첫 풀이 턴
  if (i.wrapMode !== "free") return false; // 정리·마무리 구간
  if (i.crisisActive || i.forceEnd) return false;
  if (i.userShortStreak) return false; // 지친 신호 — 결제 제안 X
  if (i.clarifierCount > 0) return false; // 이미 보조 카드 구매
  if (i.pastAssistantTexts.some(hasClarifierMarker)) return false; // 대화당 1회
  return i.userAsking;
}

export interface KeepOpenInput {
  wrapMode: WrapModeLike;
  /** 강제 종료 턴(마무리 버튼·강제 종료선) */
  mustEnd: boolean;
  crisisActive: boolean;
  /** classifyUserTurn(이번 유저 말).asking */
  userAsking: boolean;
  /**
   * 별콩이의 직전 턴이 질문으로 끝났나 — computeTurnSignals().lastTurnEndedWithQuestion.
   * 과거 메시지만 보므로 wrapMode 와 무관하다(라우트는 실제 wrapMode 로 계산한 값을 쓴다).
   */
  lastTurnEndedWithQuestion: boolean;
  /**
   * classifyUserTurn(이번 유저 말).closingExplicit — 감사·작별·수긍·종결 같은 **명시적 마무리어**. asking 이면 항상 false.
   * 단독 짧은 동의("응"·"네"·"그래")는 closing 이어도 여기선 false — 별콩이가 질문한 직후엔 그게 마무리가 아니라 대답이다(⑥, 사용자 결정 2026-10-04).
   */
  userClosing: boolean;
}

/**
 * 자연 마무리선 턴에서 닫지 않을 때 — 유저가 묻는 중이거나(spec §3-3),
 * 별콩이가 직전 턴을 질문으로 끝냈는데 유저 답이 마무리 신호가 아닐 때(⑥, 사용자 결정 2026-10-04).
 * 후자: 열어 둔 턴의 별콩이는 질문으로 끝낼 수 있고, 그 질문에 짧게 답한("일주일 전쯤") 유저를 자연 마무리로 닫으면 '묻고 → 답했더니 → 작별'이 된다.
 * 연쇄는 스스로 끊긴다 — 질문 2연속 금지(computeTurnClose)로 다음 턴은 질문으로 끝나지 않고, 강제 종료선이 상한이다.
 */
export function shouldKeepOpen(i: KeepOpenInput): boolean {
  return (
    i.wrapMode === "hardcap" &&
    !i.mustEnd &&
    !i.crisisActive &&
    (i.userAsking || (i.lastTurnEndedWithQuestion && !i.userClosing))
  );
}

type TurnCloseLike = "ask" | "invite" | "settle";

/**
 * 강제 종료 직전(abs−1) 턴에서 열어 둔 턴은 질문으로 끝내지 않는다 — 마지막 수렴 턴 가이드의 "새 질문 X" 와 같은 규칙(사용자 결정 2026-10-04).
 * 열어 둔 턴(keep-open · ⑦)은 turnSignals 를 wrapMode "free" 로 다시 계산하므로 turnClose 가 '질문'(ask)이 될 수 있다. 그런데 다음 턴은 강제 종료라
 * 여기서 질문하면 유저가 답한 뒤 곧장 작별을 받는다 — ⑥ 이 다른 곳에서 없앤 '묻고 → 답했더니 → 작별'이다. ask 를 invite 로 내린다.
 * ⑦ 턴은 항상 abs−1 이고, 자연 마무리선에서 열어 둔 턴도 abs−1 이면 해당된다. 그 밖(abs−2 이전 · 열어 둔 턴이 아님 · settle·invite)은 그대로다.
 * 프롬프트와 저장되는 messages.turn_close 가 같은 값을 쓰도록 호출부는 turnSignals 자체를 이 결과로 만든다.
 */
export function capTurnCloseBeforeAbsCap(
  turnClose: TurnCloseLike | undefined,
  i: { keepOpenTurn: boolean; assistantTurnsSoFar: number; effAbsTurnCap: number },
): TurnCloseLike | undefined {
  // 이번 턴이 assistantTurnsSoFar+1 번째, 다음 턴이 +2 번째 — 다음 턴이 강제 종료선이면(abs−1) 질문으로 끝내지 않는다
  return i.keepOpenTurn && i.assistantTurnsSoFar + 2 >= i.effAbsTurnCap && turnClose === "ask" ? "invite" : turnClose;
}

// '카드 한 장' 은 넣지 않는다 — 마무리 인사("카드 한 장으로 다 풀리진 않지만")·평범한 문장에 걸려
// 제안 없는 칩이 붙는다(prod 표본 25건 중 제안 1건, 2026-10-04). spec §3-5 ③
const OFFER_PHRASE_RE = /한\s*장\s*(?:을\s*)?더/;
const VISIBLE_MARKERS_RE = /\[(?:END|CARD:\d+|RECO:[a-z0-9_:]+)\]/gi;

// [END] 가 있는 응답 = 대화를 닫는 응답. 여기에 칩을 붙이면 끝난 대화에 칩이 떠서, 누르면 400(reading_already_ended).
// 클라가 [END] 를 보는 눈(lib/tarot/bubbles.ts END_MARKER_REGEX — 대소문자 무시·위치 무관)과 같게 본다. 사용자 결정 2026-10-04
const HAS_END_RE = /\[END\]/i;

/**
 * 후보 턴 응답에 '한 장 더' 제안 문구가 있는데 마커만 빠졌으면 끝에 붙인다. 앞부분은 절대 바꾸지 않는다(스트림 꼬리로 보내기 때문).
 * [END] 가 있는(닫는) 응답은 건드리지 않는다.
 */
export function repairClarifierMarker(text: string): string {
  if (HAS_END_RE.test(text)) return text;
  if (hasClarifierMarker(text)) return text;
  if (!OFFER_PHRASE_RE.test(text.replace(VISIBLE_MARKERS_RE, ""))) return text;
  return `${text}\n${CLARIFIER_MARKER}`;
}

const END = "[END]";

/** s[0..end) 꼬리 중 "[END]" 의 앞부분(1~4자)인 가장 긴 조각의 길이 — 없으면 0 */
function partialEndTailLen(s: string, end: number): number {
  for (let n = Math.min(END.length - 1, end); n > 0; n--) {
    if (END.startsWith(s.slice(end - n, end))) return n;
  }
  return 0;
}

/**
 * 스트림에서 [END] 를 걸러낸다. keep-open 턴 전용 — 이 턴엔 [END] 가 전송·저장 어디에도 남으면 안 된다(spec §3-3).
 * 청크 경계에 걸친 "[EN"+"D]" 도, 지운 자리에서 새로 맞붙은 "[E[END]ND]" 도 지운다. 결과는 청크를 어디서 끊든 같다.
 */
export function createEndMarkerFilter(): { push(chunk: string): string; flush(): string } {
  let pending = ""; // 아직 내보내지 않은 꼬리 — 항상 [END] 를 포함하지 않는다
  return {
    push(chunk: string): string {
      let s = pending + chunk;
      while (s.includes(END)) s = s.split(END).join(""); // 지운 자리에서 새로 맞붙은 [END] 까지, 더 없을 때까지 반복
      // 끝부분이 "[END]" 의 앞부분일 수 있으면 붙잡아 둔다. 안쪽 [END] 가 지워지면 바깥 조각이 다시 열리므로
      // ("[E"+"[END]"+"ND]") 앞부분 조각이 이어지는 만큼 벗겨 올라가며 전부 붙잡는다 — 이미 보낸 글자가 나중에 마커로 합쳐지면 안 된다
      let from = s.length;
      for (let k = partialEndTailLen(s, from); k > 0; k = partialEndTailLen(s, from)) from -= k;
      pending = s.slice(from);
      return s.slice(0, from);
    },
    flush(): string {
      const out = pending;
      pending = "";
      return out;
    },
  };
}

const END_TAIL = `\n\n${END}`;
// replace·match 전용 /g 정규식 — .test()·.exec() 를 쓰면 lastIndex 가 호출 사이에 새어 나간다(VISIBLE_MARKERS_RE 와 같은 규칙)
const ANY_END_RE = /\[END\]/gi;
const BOLD_END_RE = /\*\*\[END\]\*\*/gi; // 대칭 굵게만 — 한쪽만 붙은 `**[END]` 는 [END] 만 지우는 쪽(ANY_END_RE)이 맡는다

export interface FinalizeTurnInput {
  /** 강제 종료 턴 — 마무리 버튼 또는 강제 종료선(라우트의 mustEnd) */
  mustEnd: boolean;
  /** 이번 메시지 sensitive 또는 이전 턴에서 이미 has_sensitive */
  crisisActive: boolean;
  /** 유저가 마무리 버튼을 눌렀나 — 위기여도 버튼은 닫는다 */
  forceEnd: boolean;
  /** '한 장 더' 후보 턴(isClarifierCandidate) */
  clarifierCandidate: boolean;
}

/**
 * 응답 끝처리 — 스트림이 끝난 뒤 저장본과, 스트림에 덧붙일 꼬리를 정한다(spec 2026-10-04-타로톡-인챗결제-대화길이 §3-4·§3-5).
 *
 * 강제 종료 턴(위기로 자동 종료가 억제된 턴 제외 — 버튼은 위기여도 닫는다):
 *  - [END] 가 대소문자 무시로 하나도 없으면 → 저장본·스트림 모두 끝에 "\n\n[END]" 를 붙인다.
 *  - 대문자 [END] 가 딱 하나이고 맨 끝(뒤는 공백뿐)이면 → 그대로.
 *  - 그 밖(소문자·굵게·중복·본문 중간·끝 뒤 다른 글자)이면 → 저장본에서 [END] 를 전부(굵게 `**[END]**` 째로) 지우고 끝에 하나만 붙인다.
 *    클라는 이미 종료 마커를 받았으니(대소문자 무시·위치 무관) 스트림 꼬리는 없다. 클라 사본은 재개 때 stripEndFromLastAssistant 가 전부 지운다.
 *  이유: 재개 헤더(X-Reopen)는 모델 출력 전에 나가는데, 저장본이 [END] 하나·맨 끝 모양이 아니면 tarotEndState 가 재개 대상으로 안 봐
 *  버튼이 눌러도 구매 전에 400 으로 죽는다(prod 1,779건 중 4건).
 * '한 장 더' 후보 턴: repairClarifierMarker — 붙은 꼬리만 스트림으로 보낸다. 강제 종료 턴과는 겹치지 않는다(후보는 자유 구간·!forceEnd).
 * 그 밖: 그대로.
 */
export function finalizeAssistantText(
  text: string,
  i: FinalizeTurnInput,
): { saved: string; streamTail: string } {
  if (i.mustEnd && !(i.crisisActive && !i.forceEnd)) {
    const count = (text.match(ANY_END_RE) ?? []).length;
    if (count === 0) return { saved: text + END_TAIL, streamTail: END_TAIL };
    if (count === 1) {
      const at = text.search(/\[END\]/i); // 비전역 — lastIndex 상태 없음
      if (text.slice(at, at + END.length) === END && text.slice(at + END.length).trim() === "") {
        return { saved: text, streamTail: "" };
      }
    }
    let s = text;
    for (;;) {
      // 지운 자리에서 새로 맞붙은 마커("[E[END]ND]")까지, 더 없을 때까지 — createEndMarkerFilter 와 같은 이유
      const next = s.replace(BOLD_END_RE, "").replace(ANY_END_RE, "");
      if (next === s) break;
      s = next;
    }
    return { saved: s.trimEnd() + END_TAIL, streamTail: "" };
  }
  if (i.clarifierCandidate) {
    const saved = repairClarifierMarker(text);
    return { saved, streamTail: saved.slice(text.length) }; // repairClarifierMarker 는 앞부분을 바꾸지 않는다
  }
  return { saved: text, streamTail: "" };
}
