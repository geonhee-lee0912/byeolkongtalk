// 유저 발화 분류 — 자연 마무리선 keep-open 과 '카드 한 장 더' 후보 판정의 단일 원천.
// 규칙의 정본은 이 헤더다(spec 2026-10-04-타로톡-인챗결제-대화길이 §3-2 는 요약).
//
// 원칙: asking 과대판정은 싸고(한 턴 더 열림·후보 탈락) 놓치는 쪽이 비싸다(묻는 중 닫힘)
//       → 명시적 질문·요청은 마무리어보다 우선한다.
//
// body: 마지막 접속어(근데·그런데·그리고·그치만·하지만) 뒷말 — "고마워 근데 …" 는 뒷말이 본론이다.
//       접속어가 없거나 뒷말이 비면 전체. 단 '?' 는 접속어 앞이어도 센다.
//       말끝 꼬리(공백·문장부호·ㅠㅜㅋㅎ·이모지 …)는 질문 어미 판정 전에 뗀다.
// 질문: '?' 포함, 또는 body 말끝이 질문 전용 어미 — 까(요)·니·냐·는지·건가·나요.
//       반말 평서문은 "~어/~야/~지" 로 끝나 의문으로 보면 대부분 질문이 돼 버리므로 그 어미는 쓰지 않는다. 예외·보강:
//  - "~니까(요)" 는 원인 접속("그러니까") — 앞 글자 받침이 ㅂ(합니까·습니까)일 때만 질문
//  - "~가요" 는 앞 글자 받침이 ㄴ(인가요·건가요·한가요)일 때만 질문 — "저 이제 가요" 는 제외
//  - "~지" 는 앞 글자 받침이 ㄴ·ㄹ 이면 간접 의문(건지·은지·올지·될지…) — 그렇지·좋지·했지 는 받침이 달라 제외
//  - 알려진 값싼 오탐: 할머니·어머니 같은 "~니" 명사, "화나요" 같은 "~나요" 평서
// 요청: 궁금·알려줘·말해줘·봐줘·주세요·줄래·어때·어떡해·어떻게 해 (인과 "-줘서" 는 감사라 제외).
// 마무리어(body 말끝 15자 안에서만): 강한 것 = 감사·작별, 약한 것 = 수긍·종결 표현(알겠·됐어·마무리 …). + 단독 짧은 동의.
//       약한 것은 하소연 속에도 흔해("결국 잘 안 됐어") 긴 고민 판정을 막지 못한다.
// 판정식:  asking  = 질문 || 요청 || (전체 40자 이상 && !(강한 마무리어 || 짧은 동의))
//          closing = (마무리어 || 짧은 동의) && !asking     → 둘 다 false 면 중립, 둘 다 true 는 없다.

const QUESTION_MARK_RE = /[?？]/;
// 꼬리(문장부호·ㅠㅜㅋㅎ·이모지)는 stripTrailingNoise 로 먼저 떼고 core 에 건다 — 꼬리를 `\s*[...]*$` 로 두면 이차 백트래킹.
const QUESTION_ENDING_RE = /(까요?|니|냐|는지|건가|나요)$/;
// 강한 마무리어 = 감사 + 작별. 작별어는 뒤에 한글이 붙지 않을 때만(안녕≠안녕하세요·바이≠바이브·잘 자≠잘 자지 못해·내일 봐≠내일 봐야) — 존댓말(안녕히·잘 자요)은 따로.
const STRONG_CLOSING_RE = /(고마워|고마웠|고맙|감사|갈게|안녕(?![가-힣])|안녕히|또\s*올게|잘\s*자(?![가-힣])|잘\s*자요|내일\s*(봐|보자)(?![가-힣])|들어갈게|바이(?![가-힣])|ㅂㅂ)/;
// 약한 마무리어 = 수긍·종결 표현. 긴 하소연 속에도 흔해("결국 잘 안 됐어", "마무리해야 하는데") 긴 고민 판정(LONG_CONCERN_LEN)을 막지 못한다.
const WEAK_CLOSING_RE = /(알겠|알았|그렇구나|이해(했|됐|돼)|맞네|충분|이만|마무리|됐어|ㅇㅋ|오키)/;
// 망설임 꼬리(…·ㅠ)는 동의로 보지 않는다 — 의도적으로 좁은 꼬리 집합
const SHORT_AGREE_RE = /^(응+|ㅇㅇ+|그래|네+|웅+|넹|엉)[.!~ㅎㅋ\s]*$/;
// "궁금해·봐줘·알려줘·주세요·줄래·어때·어떡해" 류 요청·궁금함 — 물음표 없이도 답을 원하는 신호. 마무리어보다 우선한다.
// 인과 "-줘서"("봐줘서 고마워")는 요청이 아니라 감사라 제외(?!서).
const REQUEST_RE = /(궁금|알려\s*줘(?!서)|말해\s*줘(?!서)|봐\s*줘(?!서)|주세요|줄래|어때|어떡해|어떻게\s*해)/;
/** 물음표 없이도 새 고민을 길게 털어놓으면 '묻는 중'으로 본다 */
const LONG_CONCERN_LEN = 40;
// 마무리어는 말끝(마지막 15자)에 있을 때만 마무리로 본다 — "걔가 고마웠는데 요즘 서운해" 같은 하소연 중간의 감사 표현을 마무리로 오판하지 않게.
const CLOSING_TAIL_LEN = 15;

// 말끝 꼬리 = 공백·문장부호·ㅠㅜㅋㅎㅡ·^ ;·♡★☆·전각 ！～。·이모지(VS16·ZWJ 포함). 뒤에서부터 한 code point 씩 센다 —
// 서러게이트 쌍이 반쪽으로 끊기지 않고, 정규식 `[...]+$` 의 이차 백트래킹도 없다(선형). 룩비하인드는 쓰지 않는다(클라 번들 대비).
const NOISE_CP_RE = /^(?:[\s.…~!^;ㅠㅜㅋㅎㅡ♡★☆！～。\uFE0F\u200D]|\p{Extended_Pictographic})$/u;
function stripTrailingNoise(t: string): string {
  let end = t.length;
  while (end > 0) {
    const lo = t.charCodeAt(end - 1);
    const start = end >= 2 && lo >= 0xdc00 && lo <= 0xdfff ? end - 2 : end - 1;
    if (!NOISE_CP_RE.test(t.slice(start, end))) break;
    end = start;
  }
  return t.slice(0, end);
}

/** 한글 음절의 받침 인덱스(0=없음·4=ㄴ·8=ㄹ·17=ㅂ). 한글 음절이 아니거나 문자가 없으면 -1. */
function jongseong(ch: string | undefined): number {
  if (!ch) return -1;
  const code = ch.charCodeAt(0) - 0xac00;
  return code < 0 || code > 11171 ? -1 : code % 28;
}
const JONG_N = 4; // ㄴ
const JONG_L = 8; // ㄹ
const JONG_B = 17; // ㅂ

// 말끝 질문 어미 판정. core = 꼬리를 뗀 말끝.
// "~니까(요)" 는 원인 접속("그러니까·하니까요")이라 합니까·습니까처럼 앞 글자 받침이 ㅂ 일 때만 질문.
const NIKKA_RE = /니까요?$/;
function endsWithQuestionEnding(core: string): boolean {
  const nikka = NIKKA_RE.exec(core);
  if (nikka) return jongseong(core[nikka.index - 1]) === JONG_B;
  if (QUESTION_ENDING_RE.test(core)) return true;
  // "~ㄴ가요"(인가요·건가요·한가요) 는 질문 — "저 이제 가요" 의 "가요" 는 앞 글자 받침이 달라 제외
  return core.endsWith("가요") && jongseong(core[core.length - 3]) === JONG_N;
}

// "~ㄴ지/~ㄹ지" 간접 의문(건지·은지·올지·될지…) — 앞 글자 받침이 ㄴ·ㄹ 이면 질문.
// "그렇지·좋지·했지" 같은 평서 "~지" 는 받침이 달라 걸리지 않는다.
function endsWithIndirectQuestion(core: string): boolean {
  if (!core.endsWith("지")) return false;
  const jong = jongseong(core[core.length - 2]);
  return jong === JONG_N || jong === JONG_L;
}

// "고마워 근데 …" 처럼 마무리어 뒤에 접속어로 말을 이으면 뒷말이 본론이다 → 마지막 접속어 뒤만 본다.
// 모듈 스코프 /g 정규식 — matchAll 전용이다. .test()·.exec() 를 쓰면 lastIndex 가 호출 사이에 새어 나간다.
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
  /** 마무리 신호(감사·수긍·작별·짧은 동의) — 질문·요청이 섞이면 false */
  closing: boolean;
}

/**
 * 유저 한 턴을 분류한다. 둘 다 false = 중립(기본 동작), 동시에 true 인 경우는 없다(closing 은 asking 이 아닐 때만).
 * 규칙·원칙은 파일 상단 헤더 참고.
 */
export function classifyUserTurn(text: string): UserTurnClass {
  const t = text.trim();
  const body = afterLastConjunction(t);
  const core = stripTrailingNoise(body); // 말끝 꼬리를 뗀 본문 — 질문 어미 판정용
  const hasQuestion = QUESTION_MARK_RE.test(t) || endsWithQuestionEnding(core) || endsWithIndirectQuestion(core);
  const tail = body.slice(-CLOSING_TAIL_LEN);
  const strongTail = STRONG_CLOSING_RE.test(tail);
  const shortAgree = SHORT_AGREE_RE.test(body);
  const closingPattern = strongTail || shortAgree || WEAK_CLOSING_RE.test(tail);
  // 명시적 질문·요청은 마무리어보다 우선 — '묻는 중 닫힘'이 '한 턴 더 열림'보다 비싸다.
  // 긴 고민 판정은 강한 마무리어·짧은 동의만 막는다(약한 마무리어는 하소연 속에도 흔하다).
  const asking = hasQuestion || REQUEST_RE.test(body) || (t.length >= LONG_CONCERN_LEN && !(strongTail || shortAgree));
  return { asking, closing: closingPattern && !asking };
}
