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
}

/** 서버가 고르는 '한 장 더' 후보 턴 — 최종 제안 여부는 별콩이가 기준을 보고 정한다 */
export function isClarifierCandidate(i: ClarifierCandidateInput): boolean {
  if (i.assistantTurnsSoFar < 1) return false; // 첫 풀이 턴
  if (i.wrapMode !== "free") return false; // 정리·마무리 구간
  if (i.crisisActive || i.forceEnd) return false;
  if (i.clarifierCount > 0) return false; // 이미 보조 카드 구매
  if (i.pastAssistantTexts.some(hasClarifierMarker)) return false; // 대화당 1회
  return i.userAsking;
}

export interface KeepOpenInput {
  wrapMode: WrapModeLike;
  /** 강제 종료 턴(마무리 버튼·강제 종료선) */
  mustEnd: boolean;
  crisisActive: boolean;
  userAsking: boolean;
}

/** 자연 마무리선 턴에서 유저가 묻는 중이면 닫지 않는다 */
export function shouldKeepOpen(i: KeepOpenInput): boolean {
  return i.wrapMode === "hardcap" && !i.mustEnd && !i.crisisActive && i.userAsking;
}

// '카드 한 장' 은 넣지 않는다 — 마무리 인사("카드 한 장으로 다 풀리진 않지만")·평범한 문장에 걸려
// 제안 없는 칩이 붙는다(prod 표본 25건 중 제안 1건, 2026-10-04). spec §3-5 ③
const OFFER_PHRASE_RE = /한\s*장\s*(?:을\s*)?더/;
const VISIBLE_MARKERS_RE = /\[(?:END|CARD:\d+|RECO:[a-z0-9_:]+)\]/gi;

/** 후보 턴 응답에 '한 장 더' 제안 문구가 있는데 마커만 빠졌으면 끝에 붙인다. 앞부분은 절대 바꾸지 않는다(스트림 꼬리로 보내기 때문) */
export function repairClarifierMarker(text: string): string {
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
