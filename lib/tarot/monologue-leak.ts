// 모델 독백 누출 — 별콩이가 답을 다 쓴 뒤 맨 끝에 자기 규칙 점검 메모(영어 + 한국어 일부, "no question … final concise" 류)를
// 덧붙이는 결함. 모델이 생각을 답 본문에 직접 쓰는 것이라 API 설정으로는 못 막는다(gpt-5.6-luna, 2026-10-05 조사:
// prod 90일 타로 답 약 1만 500건 중 7건 · QA 약 1,000턴에 1건 · 확인한 사례는 전부 답의 맨 끝).
// 생기는 순간 화면엔 보이지만(스트림은 이미 나갔다) 저장본과 다음 턴 모델 입력에서 잘라낸다 — 기록에 남으면 다음 턴에 모델이
// 자기 메모를 다시 읽는다. 정상 답을 자르는 쪽이 비싸므로 판별은 보수적이다(끝 500자 안에서만 찾는다):
//  - 프롬프트 내부 용어(이번 턴 신호 · 턴 마무리 상태 · 직전 별콩이 턴/직전 내 턴 · turn_close)는 정상 답에 나올 일이 없다.
//    낱말 속 '턴 신호'(패턴 신호·U턴 신호·유턴 신호)는 정상 말이라 정확한 표현만 본다
//  - 영어 4단어 이상 연속 + 그 뒤 끝까지가 거의 영어(한글 비율 25% 이하) + 메모 특유의 단어(no/any/ask question · instruction ·
//    assistant · user · concise · ensure · translate · summary)가 있을 때만 — 카드명 나열·영어 응원 문구·번역 줄·노래 제목은 걸리지 않는다
//  - 자르는 곳 = 메모가 시작된 문장의 처음(직전 마침표류·줄바꿈·~·이모지 바로 뒤). 메모 바로 앞의 마커([END] 등)는 남긴다
//  - 그래도 자르지 않는 경우: 남는 답의 한글이 40자 미만(영어로 답해 달라는 요청 등) · 잘릴 구간이 500자 초과(메모가 아니라 영어 본문) ·
//    잘릴 구간에 코드 블록 펜스(다른 결함이고, 자르면 펜스가 깨진다)
//  - 메모 뒤 맨 끝의 [END]·[RECO:…](굵게·끝 마침표 꼴 포함)는 맨 마커로 남긴다 — 메모 안에 섞인 [END] 는 메모와 함께 지운다
// 클라가 보낸 이력(최대 60개 × 8,000자)도 스트림 전에 동기로 거치므로 모든 반복에 상한을 둬 길이에 비례해 끝나게 했다.

export interface LeakCut {
  text: string;
  cut: boolean;
  reason?: "jargon" | "english_tail";
  /** 잘라낸 글자 수(남긴 마커·줄바꿈 반영 후 길이 차) */
  cutChars?: number;
}

const MARKER_RE = /\[(?:END|CARD:\d+|RECO:[a-z0-9_:]+)\]/gi;
const END_RECO_RE = /\[(?:END|RECO:[a-z0-9_:]+)\]/gi;
const TRAILING_MARKERS_RE = /(?:\s{0,8}\*{0,2}\[(?:END|RECO:[a-z0-9_:]+)\]\*{0,2}[.!]?)+\s*$/i;
const JARGON_RE = /이번\s{0,3}턴\s{0,3}신호|턴\s{0,3}마무리\s{0,3}상태|직전\s{0,3}(?:내|별콩이)\s{0,3}턴|turn_close/i;
// 단어 = 영문자로 시작(아포스트로피 포함 — Let's), 40자까지 · 구분자 = 공백·문장부호 8자까지. 상한이 없으면 구분자 없는 긴 '단어'에서 시작점마다 끝까지 다시 훑는다
const ENGLISH_RUN_RE = /[A-Za-z][A-Za-z'’]{0,39}(?:[\s,.?!:;"“”()-]{1,8}[A-Za-z][A-Za-z'’]{0,39}){3,}/g;
// 메모 단어 — 실제 누출(QA·prod)에 나온 것만. question 은 'no/any/ask question' 꼴만("Never question your worth" 같은 응원은 아니다).
// answer·settle·invite·english·korean 은 흔한 영어 응원·번역 줄("love is the answer"·"Don't settle"·"In English:")과 겹쳐 뺐다 — 누출 사례는 다른 단어로 다 잡힌다
const META_WORD_RE = /\b(?:(?:no|any|ask)\s{1,3}questions?|instructions?|assistant|user|concise|ensure|translate|summary)\b/i;
const BOUNDARY_RE = /^(?:[.!?…\n~️‍]|\p{Extended_Pictographic})$/u;
const HANGUL_RE = /[가-힣]/;
const LATIN_RE = /[A-Za-z]/;

const MAX_CUT_CHARS = 500;
// 끝 마커는 맨 끝 몇십 자다 — 글 전체에 걸면 마커가 반복된 입력에서 시작점마다 끝까지 먹었다가 되돌아온다(제곱)
const TRAILING_SCAN_CHARS = 200;
const MIN_KEPT_HANGUL = 40;
const MAX_TAIL_HANGUL_SHARE = 0.25;

function countHangul(s: string): number {
  let n = 0;
  for (const ch of s) if (HANGUL_RE.test(ch)) n++;
  return n;
}

/** 영어 메모가 시작되는 위치(s 기준) — 그 뒤 끝까지가 거의 영어이고 메모 단어가 있는 첫 영어 4단어 연속. 없으면 -1 */
function englishTailStart(s: string): number {
  // 뒤에서부터 누적한 한글·영문 글자 수 — 후보마다 꼬리를 다시 세지 않는다
  const hangulFrom = new Array<number>(s.length + 1).fill(0);
  const latinFrom = new Array<number>(s.length + 1).fill(0);
  for (let i = s.length - 1; i >= 0; i--) {
    hangulFrom[i] = hangulFrom[i + 1] + (HANGUL_RE.test(s[i]) ? 1 : 0);
    latinFrom[i] = latinFrom[i + 1] + (LATIN_RE.test(s[i]) ? 1 : 0);
  }
  for (const m of s.matchAll(ENGLISH_RUN_RE)) {
    const i = m.index;
    const hangul = hangulFrom[i];
    if (hangul / (hangul + latinFrom[i]) <= MAX_TAIL_HANGUL_SHARE && META_WORD_RE.test(s.slice(i))) return i;
  }
  return -1;
}

/** 메모가 시작된 문장의 처음 — at 에서 거슬러 올라가 문장 경계(마침표류·줄바꿈·~·이모지) 바로 뒤. 가린 마커 칸을 만나면 그 마커 바로 뒤에서
 *  멈춘다(메모 앞의 마커는 남긴다). 경계가 없으면 at. 코드 포인트 단위로 걷는다(이모지는 서로게이트 쌍이다) */
function sentenceStart(masked: string, text: string, at: number): number {
  let i = at;
  while (i > 0) {
    let j = i - 1;
    const lo = masked.charCodeAt(j);
    if (lo >= 0xdc00 && lo <= 0xdfff && j > 0) {
      const hi = masked.charCodeAt(j - 1);
      if (hi >= 0xd800 && hi <= 0xdbff) j--;
    }
    if (masked[j] !== text[j]) return i;
    if (BOUNDARY_RE.test(masked.slice(j, i))) return i;
    i = j;
  }
  return at;
}

export function stripLeakedMonologue(text: string): LeakCut {
  const unchanged: LeakCut = { text, cut: false };
  // 마커를 같은 길이의 공백으로 가려 인덱스를 맞춘다 — [RECO:tarot:clarifier] 의 영문을 메모로 오인하지 않게
  const masked = text.replace(MARKER_RE, (m) => " ".repeat(m.length));
  const windowStart = Math.max(0, masked.length - MAX_CUT_CHARS);
  const tail = masked.slice(windowStart);

  const jargonAt = tail.search(JARGON_RE);
  const englishAt = englishTailStart(tail);
  const found = [jargonAt, englishAt].filter((i) => i >= 0);
  if (found.length === 0) return unchanged;
  const rel = Math.min(...found);
  const reason: LeakCut["reason"] = rel === jargonAt ? "jargon" : "english_tail";

  const cutStart = sentenceStart(masked, text, windowStart + rel);
  const tailFrom = Math.max(0, text.length - TRAILING_SCAN_CHARS);
  const trailing = TRAILING_MARKERS_RE.exec(text.slice(tailFrom));
  const trailingAt = trailing ? tailFrom + trailing.index : -1;
  const markersAt = trailingAt >= cutStart ? trailingAt : text.length;
  const markers = (text.slice(markersAt).match(END_RECO_RE) ?? []).join("\n");
  const segment = text.slice(cutStart, markersAt);
  const kept = text.slice(0, cutStart).trimEnd();
  if (segment.length > MAX_CUT_CHARS || segment.includes("```") || countHangul(kept) < MIN_KEPT_HANGUL) return unchanged;

  const out = markers ? `${kept}\n${markers}` : kept;
  return { text: out, cut: true, reason, cutChars: text.length - out.length };
}
