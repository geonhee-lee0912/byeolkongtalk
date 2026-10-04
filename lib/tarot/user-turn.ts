// 유저 발화 분류 — 자연 마무리선 keep-open 과 '카드 한 장 더' 후보 판정의 단일 원천
// (spec 2026-10-04-타로톡-인챗결제-대화길이 §3-2).
// 반말 평서문은 "~어/~야/~지" 로 끝나 의문 어미로 보면 대부분 질문이 돼 버린다 → 의문 어미는
// 질문에만 쓰이는 것(까·니·냐·는지·건가)만 본다. 단 "~지" 는 앞 글자 받침이 ㄴ·ㄹ 이면
// 간접 의문(건지·은지·올지·될지…)으로 본다 — 그렇지·좋지·했지 같은 평서 "~지" 는 받침이 달라 제외.
// 오분류 비용은 "한 턴 더 열어 둠"/"후보 탈락"으로 작다.

const QUESTION_MARK_RE = /[?？]/;
const QUESTION_ENDING_RE = /(까|니|냐|는지|건가)\s*[.…~!ㅠㅜㅋㅎ\s]*$/;
const CLOSING_RE = /(고마워|고마웠|고맙|감사|알겠|알았|그렇구나|이해(했|됐|돼)|맞네|충분|이만|마무리|됐어|ㅇㅋ|오키)/;
const SHORT_AGREE_RE = /^(응+|ㅇㅇ+|그래|네+|웅+|넹|엉)[.!~ㅎㅋ\s]*$/;
// "궁금해·봐줘·알려줘·어때·어떡해" 류 요청·궁금함 — 물음표 없이도 답을 원하는 신호.
// 단 "봐줘서 고마워" 처럼 마무리 패턴이 섞이면 asking 으로 보지 않는다(아래 조합 참고).
const REQUEST_RE = /(궁금|알려\s*줘|말해\s*줘|봐\s*줘|어때|어떡해|어떻게\s*해)/;
/** 물음표 없이도 새 고민을 길게 털어놓으면 '묻는 중'으로 본다 */
const LONG_CONCERN_LEN = 40;

// "~ㄴ지/~ㄹ지" 간접 의문(건지·은지·올지·될지…) — 앞 글자 받침이 ㄴ(4)·ㄹ(8)이면 질문.
// "그렇지·좋지·했지" 같은 평서 "~지" 는 받침이 달라 걸리지 않는다.
const TRAILING_NOISE_RE = /[\s.…~!ㅠㅜㅋㅎ]+$/;
function endsWithIndirectQuestion(t: string): boolean {
  const s = t.replace(TRAILING_NOISE_RE, "");
  if (s.length < 2 || !s.endsWith("지")) return false;
  const code = s.charCodeAt(s.length - 2) - 0xac00;
  if (code < 0 || code > 11171) return false;
  const jong = code % 28;
  return jong === 4 || jong === 8;
}

// "고마워 근데 …" 처럼 마무리어 뒤에 접속어로 말을 이으면 뒷말이 본론이다 → 마지막 접속어 뒤만 본다.
const CONJ_RE = /(근데|그런데|그리고|그치만|하지만)/g;
function afterLastConjunction(t: string): string {
  let last = -1;
  let len = 0;
  for (const m of t.matchAll(CONJ_RE)) {
    last = m.index ?? -1;
    len = m[0].length;
  }
  if (last < 0) return t;
  const tail = t.slice(last + len).trim();
  return tail.length > 0 ? tail : t;
}

export interface UserTurnClass {
  /** 질문·요청·궁금함 또는 새 고민 — 대화를 닫지 말아야 하는 신호 */
  asking: boolean;
  /** 마무리 신호(감사·수긍·짧은 동의) — 질문이 섞이면 false */
  closing: boolean;
}

export function classifyUserTurn(text: string): UserTurnClass {
  const t = text.trim();
  const body = afterLastConjunction(t);
  const hasQuestion = QUESTION_MARK_RE.test(t) || QUESTION_ENDING_RE.test(body) || endsWithIndirectQuestion(body);
  const closingPattern = CLOSING_RE.test(body) || SHORT_AGREE_RE.test(body);
  return {
    asking: hasQuestion || (!closingPattern && (REQUEST_RE.test(body) || t.length >= LONG_CONCERN_LEN)),
    closing: closingPattern && !hasQuestion,
  };
}
