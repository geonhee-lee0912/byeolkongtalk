// 유저 발화 분류 — 자연 마무리선 keep-open 과 '카드 한 장 더' 후보 판정의 단일 원천.
// 정본 = lib/tarot/user-turn.ts 헤더 주석(이 헤더). spec 2026-10-04-타로톡-인챗결제-대화길이 §3-2 는 요약이다.
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
//  - "~나요" 중 '나다' 복합 서술(생각·눈물·짜증·화·기억·열 + 나요)은 평서 — "생각나요?" 처럼 물음표가 붙어야 질문
//  - 알려진 값싼 오탐: 할머니·어머니 같은 "~니" 명사, 위 목록 밖의 "~나요" 평서("힘이 나요")
// 요청: 궁금·알려줘·말해줘·봐줘·주세요·줄래·어때·어떡해·어떻게 해 (인과 "-줘서" 는 감사라 제외).
// 마무리어(body 말끝 15자 안에서만): 강한 것 = 감사·작별, 약한 것 = 수긍·종결 표현(알겠·됐어·마무리 …). + 단독 짧은 동의.
//       약한 것은 하소연 속에도 흔해("결국 잘 안 됐어") 긴 고민 판정을 막지 못한다.
//  - 작별 구(句)도 약한 것에 든다 — "오늘은 여기까지 할게"·"이제 그만할게"·"그만할래"·"이제 끝낼게"·"나중에 다시 올게"·"다음에 또 얘기하자"·"다음에 봐"·"잘 있어"·
//    "수고했어"·"잘게"·"이제 쉴게"·"이제 가볼게"·"들어가볼게"·"빠이" 와 그 존댓말(요)·꼬리(ㅎㅎ·~·!) 변형(재검토에서 흔한 작별 25개 중 17개가 빠져 있었다, 사용자 결정 2026-10-04).
//    그만·여기까지·가볼게·잘게 같은 낱말을 그냥 넣으면 "연락 그만할게"·"그 카페 한번 가볼게"·"걔는 잘 있어" 같은 연애 답을 닫으므로, 구로 넣되 말끝 15자 창이 아니라
//    **발화 전체가 [군말…] + 구 (+ 호칭 "별콩아")** 일 때만 센다(말끝 꼬리·접속어 앞은 평소대로 뗀 뒤) — 대상·주어가 붙은 문장은 마무리가 아니다.
//    일부 구는 맥락어(이제·이만·나·그럼·먼저 …)가 앞에 있어야 한다(가볼게·쉴게·끝낼게). "잘 있어" 는 안부 답("응 잘 있어")과 겹쳐 대답 군말(응·네·그래·아니)을 뺀다.
//    약한 마무리어라 asking 판정은 그대로다. 애매하면 열어 둔다(원칙) — 이 구들도 "이제 그만할게" 가 관계 얘기일 수 있는 건 못 가린다.
// 판정식:  asking  = 질문 || 요청 || (전체 40자 이상 && !(강한 마무리어 || 짧은 동의))
//          closing = (마무리어 || 짧은 동의) && !asking     → 둘 다 false 면 중립, 둘 다 true 는 없다.
//          closingExplicit = 마무리어 && !asking            → closing 에서 "단독 짧은 동의만인 경우"를 뺀 부분집합(가산 필드 — closing 은 그대로).
//  - 단독 짧은 동의("응"·"네"·"그래"·"ㅇㅇ")는 별콩이 말에 맞장구치는 마무리일 수도, 예/아니오 질문에 대한 대답일 수도 있다. 별콩이가 질문으로 끝낸
//    직후라면 대답이다 — 그 맥락을 아는 keep-open ⑥(spec §3-3, 사용자 결정 2026-10-04)은 closing 이 아니라 closingExplicit 으로 마무리를 가른다.
//    ("고마워"·"알겠어"·"그렇구나" 같은 명시적 마무리어면 그대로 닫는다.)

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

// 작별 구(句) — 약한 마무리어의 일부(헤더 참고). 낱말 부분 문자열이 아니라 '발화 전체 = [군말…] + 구 (+ 호칭)' 로 비교한다.
// 수량자는 중첩하지 않고(군말 반복은 {0,3} 으로만) 전부 ^ 에 묶여 첫 글자에서 바로 떨어진다 — 8000자 적대적 입력에서도 선형이다(테스트가 고정).
const GB_SEP = "[\\s,，.]*";
const GB_VOCATIVE = "별콩(?:아|이야|이)";
// 구 앞에 올 수 있는 군말·맥락어
const GB_FILLER = `(?:${GB_VOCATIVE}|그럼|그러면|이제|오늘은|오늘|이만|자|음|아|그래|네|응|아니|먼저|슬슬|일단|그냥|나는|저는|나|저|난|전|푹|좀)`;
// "잘 있어" 는 안부 답("응 잘 있어")과 겹쳐 대답 군말(그래·네·응·아니)·'그냥' 을 뺀다
const GB_FILLER_NARROW = `(?:${GB_VOCATIVE}|그럼|그러면|이제|자|음|아)`;
function goodbyeRe(phrase: string, filler = GB_FILLER, context = ""): RegExp {
  const ctx = context ? `(?:${context})${GB_SEP}` : ""; // 구 바로 앞에 이 맥락어가 있어야 하는 구
  return new RegExp(`^(?:${filler}${GB_SEP}){0,3}${ctx}(?:${phrase})(?:${GB_SEP}${GB_VOCATIVE})?$`);
}
const GOODBYE_RES: RegExp[] = [
  // 오늘은 여기까지 — '여기까지' 단독은 구가 아니다("여기까지 왔는데")
  goodbyeRe("오늘은\\s*여기까지(?:만)?(?:\\s*(?:할게|할께|할래|하자|해요|하겠습니다))?(?:요)?"),
  goodbyeRe("여기까지(?:만)?\\s*(?:할게|할께|할래|하자|해요|하겠습니다)(?:요)?"),
  // 그만 + 1인칭 의지형 — "그만 연락하래"(남의 말)·"그만 만날래"(다른 동사)는 아니다
  goodbyeRe("그만\\s*(?:할게|할께|할래|하겠습니다)(?:요)?"),
  // 끝낼게 — 맥락어 필수("그 사람이랑 끝낼게" 가 연애 답이라)
  goodbyeRe("끝\\s*낼\\s*(?:게|께|래)(?:요)?", GB_FILLER, "이제|오늘은|오늘|이만|그럼|자|슬슬"),
  // 다시 올게
  goodbyeRe("(?:(?:나중에|다음에|담에|이따가?|내일|조만간|곧)\\s*)?(?:다시|또)\\s*(?:올게|올께|올래|찾아올게|찾아올께)(?:요)?"),
  goodbyeRe("(?:나중에|다음에|담에|이따가?|내일)\\s*올게(?:요)?"),
  // 다음에 봐 / 얘기하자 — "봐야" 는 뒤에 글자가 붙어 걸리지 않는다($)
  goodbyeRe("(?:다음에|담에|나중에|이따가?|내일)\\s*(?:(?:다시|또)\\s*)?(?:(?:얘기|이야기|대화)\\s*(?:하자|해요|할게|할께)|봐(?:요)?|보자|뵐게요)"),
  // 잘 있어 — 안부 답과 겹쳐 대답 군말을 뺀다
  goodbyeRe("잘\\s*있어(?:라|요)?", GB_FILLER_NARROW),
  // 수고
  goodbyeRe("(?:오늘(?:도)?\\s*)?(?:(?:정말|진짜|많이)\\s*)?수고\\s*(?:했어|했어요|하셨어요|하셨습니다|많았어|많았어요|했습니다)"),
  // 잘게 — 발화 전체가 '잘게' 인 것까지 구다(부분 문자열로는 안 넣는다)
  goodbyeRe("잘(?:게|께)(?:요)?"),
  // 들어가볼게 — 그 자체로 구
  goodbyeRe("들어가\\s*볼(?:게|께)(?:요)?|들어가겠습니다"),
  // 가볼게 · 쉴게 — 맥락어 필수("그 카페 한번 가볼게"·"연애 쉴게" 가 연애 답이라)
  goodbyeRe("가\\s*볼(?:게|께)(?:요)?", GB_FILLER, "이제|이만|그럼|그러면|먼저|슬슬|나는|저는|나|저|난|전|자"),
  goodbyeRe("쉴(?:게|께)(?:요)?", GB_FILLER, "이제|이만|그럼|그러면|먼저|슬슬|나는|저는|나|저|난|전|푹|좀"),
  // 빠이
  goodbyeRe("빠이(?:빠이)?|빠잇|빠잉"),
];
/** core = 말끝 꼬리를 뗀 body. 발화 전체가 작별 구(앞에 군말·뒤에 호칭 허용)면 true */
function isGoodbyePhrase(core: string): boolean {
  return GOODBYE_RES.some((re) => re.test(core));
}

// 말끝 꼬리 = 공백·문장부호·ㅠㅜㅋㅎㅡ·^ ; _·♡★☆·전각 ！～。·이모지(VS16·ZWJ 포함). 뒤에서부터 한 code point 씩 센다 —
// 서러게이트 쌍이 반쪽으로 끊기지 않고, 정규식 `[...]+$` 의 이차 백트래킹도 없다(선형). 룩비하인드는 쓰지 않는다(클라 번들 대비).
// 스킨톤 수정자는 Extended_Pictographic 이 아니라 Emoji_Modifier 라 따로 센다.
const NOISE_CP_RE = /^(?:[\s.…~!^;_ㅠㅜㅋㅎㅡ♡★☆！～。\uFE0F\u200D]|\p{Extended_Pictographic}|\p{Emoji_Modifier})$/u;
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
// "생각나요·눈물나요·짜증나요·화나요·기억나요·열나요" 는 '나다' 복합 서술(평서) — "~나요" 질문이 아니다(물음표가 붙으면 '?' 규칙으로 질문)
const NADA_STATEMENT_RE = /(생각|눈물|짜증|화|기억|열)나요$/;
function endsWithQuestionEnding(core: string): boolean {
  const nikka = NIKKA_RE.exec(core);
  if (nikka) return jongseong(core[nikka.index - 1]) === JONG_B;
  if (NADA_STATEMENT_RE.test(core)) return false;
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
  /**
   * 명시적 마무리어(감사·작별·수긍·종결)만 — 단독 짧은 동의("응"·"네"·"그래"·"ㅇㅇ")는 제외한다. closing 의 부분집합.
   * 별콩이가 질문으로 끝낸 직후의 "응" 은 마무리가 아니라 대답이라, keep-open ⑥ 은 이걸로 마무리를 가른다.
   */
  closingExplicit: boolean;
}

/**
 * 유저 한 턴을 분류한다. asking·closing 둘 다 false = 중립(기본 동작), 동시에 true 인 경우는 없다(closing 은 asking 이 아닐 때만).
 * closingExplicit ⊆ closing — 단독 짧은 동의만인 closing 에서 false.
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
  const explicitClosingWord = strongTail || WEAK_CLOSING_RE.test(tail) || isGoodbyePhrase(core); // 강·약 마무리어(작별 구 포함) — 단독 짧은 동의는 뺀다
  const closingPattern = explicitClosingWord || shortAgree;
  // 명시적 질문·요청은 마무리어보다 우선 — '묻는 중 닫힘'이 '한 턴 더 열림'보다 비싸다.
  // 긴 고민 판정은 강한 마무리어·짧은 동의만 막는다(약한 마무리어는 하소연 속에도 흔하다).
  const asking = hasQuestion || REQUEST_RE.test(body) || (t.length >= LONG_CONCERN_LEN && !(strongTail || shortAgree));
  return { asking, closing: closingPattern && !asking, closingExplicit: explicitClosingWord && !asking };
}
