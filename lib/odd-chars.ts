// 모델이 한국어 답에 섞어 내는 깨진 글자 — 키릴·인도계 문자 낱말, 중국어 광고 토막, 답 끝의 로마자 한 낱말(운영자 2026-11-22 B).
// gpt-5.6-luna 로 바꾼 2026-08-10 부터 나온다(그 전 운영·QA 0). 모델 쪽 결함이라 프롬프트로는 못 막고 출력에서 거른다.
// 모양은 둘이다:
//  - 끝 토막: 마지막 한국어 뒤에 붙은 뜻 없는 글자 → 자른다(마커·숫자는 남긴다 — 위기 안내 번호가 이 자리에 올 수 있다)
//  - 가운데 바꿔치기: 한국어 낱말 하나가 다른 언어로 나옴(अस्पष्ट=불분명) → 그 토막만 고친다(repair). 못 고치면 토막만 지운다. 문장째 지우지 않는다
// 정상으로 보는 것: 한글·라틴·공용 기호, 간지·오행 한자, 한글 뒤 괄호 한자 풀이(복음(伏吟)), 손님 글·프롬프트(known)에 있는 글자.
// 스트림은 마지막 한국어(와 바로 뒤 문장부호)까지만 내보내고 그 뒤는 다음 한국어가 올 때까지 붙잡는다 — 깨진 글자는 화면에 한 글자도 안 나간다.

export interface OddRepairRequest {
  before: string;
  token: string;
  after: string;
}
export type OddRepair = (req: OddRepairRequest) => Promise<string | null>;

export interface OddCharStats {
  /** 잘라낸 끝 토막 수 */
  cut: number;
  /** 고친 가운데 토막 수 */
  repaired: number;
  /** 지운 가운데 토막 수 */
  deleted: number;
}

const HANGUL_RE = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
const LETTER_RE = /[\p{L}\p{M}]/u;
const ALLOWED_SCRIPT_RE = /[\p{sc=Hangul}\p{sc=Latin}\p{sc=Common}\p{sc=Inherited}]/u;
const HAN_RE = /\p{sc=Han}/u;
const SAJU_HAN = new Set("甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥木火土金水日月年時運柱");
// 마지막 한국어 바로 뒤에 붙어 같이 내보내도 되는 글자(문장부호·닫는 따옴표·굵게)
const CLOSER_RE = /[.!?…~"”’')\]*,]/;
const SENTENCE_END_RE = /[.!?…~]/;
const MARKER_RE = /\[(?:END|CARD:\d+|RECO:[a-z0-9_:]+)\]/gi;
const LATIN_TAIL_RE = /^\s*([A-Za-z][A-Za-z_]{2,24})[.?!]?\s*$/;
// 답 끝에 붙어도 되는 짧은 영어 — 별콩이가 실제로 쓰는 응원 말
const LATIN_TAIL_OK = new Set(["fighting", "ok", "okay", "good", "bye", "love", "yes", "thanks", "cheers"]);
const MAX_REPAIRS = 3;
const MAX_REPAIR_TOKEN = 20;
const CONTEXT_CHARS = 80;
const READY_AFTER_CHARS = 40;
// 한국어가 이만큼 안 나오면 붙잡은 걸 판정해 내보낸다(답이 통째로 다른 언어인 경우 등) — 화면이 멈추지 않게
const HOLD_MAX_CHARS = 1500;

function charAt(text: string, i: number): string {
  const cp = text.codePointAt(i);
  return cp === undefined ? "" : String.fromCodePoint(cp);
}

function knownSet(known: string): Set<string> {
  const s = new Set<string>();
  for (const ch of known) if (LETTER_RE.test(ch) && !ALLOWED_SCRIPT_RE.test(ch)) s.add(ch);
  return s;
}

/** 한글 뒤 괄호 한자 풀이 — `복음(伏吟)` · `**창**(窓)` */
function inHanjaGloss(text: string, i: number): boolean {
  let a = i;
  while (a > 0 && HAN_RE.test(charAt(text, a - 1))) a--;
  if (text[a - 1] !== "(") return false;
  let b = i;
  while (b < text.length && HAN_RE.test(charAt(text, b))) b++;
  if (b - a > 6 || text[b] !== ")") return false;
  let k = a - 2;
  while (k >= 0 && text[k] === "*") k--;
  return k >= 0 && HANGUL_RE.test(text[k]);
}

function isOddAt(text: string, i: number, known: Set<string>): boolean {
  const ch = charAt(text, i);
  // 일본어 장음 부호는 문자 분류상 공용이라 따로 — 한국어 답에 쓸 일이 없다(QA: '루ール')
  if (ch === "ー") return !known.has(ch);
  if (!ch || !LETTER_RE.test(ch) || ALLOWED_SCRIPT_RE.test(ch) || known.has(ch)) return false;
  if (HAN_RE.test(ch) && (SAJU_HAN.has(ch) || inHanjaGloss(text, i))) return false;
  return true;
}

const step1 = (text: string, i: number) => (i < text.length && text.charCodeAt(i) >= 0xd800 && text.charCodeAt(i) <= 0xdbff ? 2 : 1);

/** from 이후 [from, to) 안에서 '여기까지는 내보내도 된다'는 자리 — 마지막 한국어 + 바로 뒤 문장부호. 없으면 from */
function releasePoint(text: string, from: number, to: number): number {
  let last = -1;
  for (let i = from; i < to; i++) if (HANGUL_RE.test(text[i])) last = i;
  // 앞 조각이 한국어(나 그 뒤 문장부호)로 끝났으면, 이번 조각 맨 앞의 문장부호도 그 한국어에 붙은 것이다
  if (last < 0 && from > 0 && (HANGUL_RE.test(text[from - 1]) || CLOSER_RE.test(text[from - 1]))) last = from - 1;
  if (last < 0) return from;
  let p = last + 1;
  while (p < to && CLOSER_RE.test(text[p])) p++;
  return p;
}

function markersIn(s: string): string[] {
  return s.match(MARKER_RE) ?? [];
}

/** 잘라낸 끝 토막 대신 남길 것 — 숫자(위기 안내 번호)와 마커 */
function tailKeep(region: string, oddAt: number, known: Set<string>): string {
  const prefix = region.slice(0, oddAt);
  const masked = (s: string) => s.replace(MARKER_RE, "");
  let keep = "";
  if (/\d/.test(masked(prefix)) && !/[A-Za-z]/.test(masked(prefix))) keep = masked(prefix).trimEnd();
  else {
    const digits = masked(region.slice(oddAt)).match(/\d[\d-]*\d|\d/g);
    if (digits) keep = (/^\s/.test(prefix) ? " " : "") + digits.join(" ");
  }
  void known;
  const marks = markersIn(region);
  return marks.length ? `${keep}\n${marks.join("\n")}` : keep;
}

type Action =
  | { kind: "emit"; to: number }
  | { kind: "replace"; from: number; to: number; with: string; counted: keyof OddCharStats }
  | { kind: "mid"; from: number; start: number; end: number; ctxEnd: number }
  | null;

function nextAction(text: string, from: number, final: boolean, known: Set<string>): Action {
  if (from >= text.length) return null;
  let f = -1;
  for (let i = from; i < text.length; i += step1(text, i)) {
    if (isOddAt(text, i, known)) {
      f = i;
      break;
    }
  }
  if (f < 0) {
    if (!final) {
      if (text.length - from > HOLD_MAX_CHARS) return { kind: "emit", to: text.length };
      const p = releasePoint(text, from, text.length);
      return p > from ? { kind: "emit", to: p } : null;
    }
    // 끝 — 문장이 닫힌 뒤 혼자 남은 로마자 한 낱말이면 자른다(acedorea · comfy. · DBG)
    const p = releasePoint(text, from, text.length);
    if (p > from) return { kind: "emit", to: p };
    const rest = text.slice(from);
    const word = LATIN_TAIL_RE.exec(rest.replace(MARKER_RE, ""))?.[1];
    if (word && from > 0 && SENTENCE_END_RE.test(text[from - 1].replace(/["”’')\]*]/, ".")) && !LATIN_TAIL_OK.has(word.toLowerCase())) {
      const marks = markersIn(rest);
      return { kind: "replace", from, to: text.length, with: marks.length ? `\n${marks.join("\n")}` : "", counted: "cut" };
    }
    return { kind: "emit", to: text.length };
  }
  const p = releasePoint(text, from, f);
  if (p > from) return { kind: "emit", to: p };

  // from..f 에는 한국어가 없다. f 뒤 첫 한국어를 찾는다 — 없으면 끝 토막, 있으면 가운데
  let h = -1;
  let e = f;
  for (let i = f; i < text.length; i += step1(text, i)) {
    if (HANGUL_RE.test(text[i])) {
      h = i;
      break;
    }
    if (isOddAt(text, i, known)) e = i + step1(text, i) - 1;
  }
  if (h < 0) {
    if (!final && text.length - from <= HOLD_MAX_CHARS) return null;
    return { kind: "replace", from, to: text.length, with: tailKeep(text.slice(from), f - from, known), counted: "cut" };
  }
  // 가운데 — 고치려면 뒤 문맥이 필요하다(문장 끝까지, 또는 어느 정도)
  let ctxEnd = -1;
  for (let i = h; i < text.length; i++) {
    if (SENTENCE_END_RE.test(text[i]) || text[i] === "\n") {
      ctxEnd = i + 1;
      break;
    }
  }
  if (ctxEnd < 0) {
    if (!final && text.length - h < READY_AFTER_CHARS) return null;
    ctxEnd = Math.min(text.length, h + READY_AFTER_CHARS);
  }
  return { kind: "mid", from, start: f, end: e + 1, ctxEnd };
}

/** 가운데 토막을 replacement 로 바꾼 뒤 이어질 위치 — 지울 때(빈 문자열)는 남는 공백·외톨이 문장부호를 정리한다 */
function afterReplace(text: string, start: number, end: number, replacement: string): number {
  if (replacement) return end;
  let z = end;
  const standalone = start === 0 || /[.!?…~]\s*$/.test(text.slice(Math.max(0, start - 3), start));
  if (standalone) {
    while (z < text.length && /[?.!…]/.test(text[z])) z++;
    while (z < text.length && text[z] === " ") z++;
  } else if (text[start - 1] === " " && text[z] === " ") z++;
  return z;
}

function isBigJunk(token: string): boolean {
  let han = 0;
  for (const ch of token) if (HAN_RE.test(ch)) han++;
  return token.length > MAX_REPAIR_TOKEN || han >= 4;
}

export function createOddCharFilter(opts: { known?: string; repair: OddRepair; disabled?: boolean }): {
  push(chunk: string): Promise<string>;
  flush(): Promise<{ tail: string; stats: OddCharStats }>;
} {
  const known = knownSet(opts.known ?? "");
  const stats: OddCharStats = { cut: 0, repaired: 0, deleted: 0 };
  let text = "";
  let pos = 0;

  async function advance(final: boolean): Promise<string> {
    let out = "";
    if (opts.disabled) {
      out = text.slice(pos);
      pos = text.length;
      return out;
    }
    for (;;) {
      const a = nextAction(text, pos, final, known);
      if (!a) break;
      if (a.kind === "emit") {
        out += text.slice(pos, a.to);
        pos = a.to;
        continue;
      }
      if (a.kind === "replace") {
        out += a.with;
        stats[a.counted]++;
        pos = a.to;
        continue;
      }
      const token = text.slice(a.start, a.end);
      let word: string | null = null;
      if (!isBigJunk(token) && stats.repaired + stats.deleted < MAX_REPAIRS) {
        try {
          word = await opts.repair({ before: text.slice(Math.max(0, a.start - CONTEXT_CHARS), a.start), token, after: text.slice(a.end, a.ctxEnd) });
        } catch {
          word = null;
        }
      }
      const replacement = word ?? "";
      if (replacement) stats.repaired++;
      else stats.deleted++;
      out += text.slice(a.from, a.start) + replacement;
      pos = afterReplace(text, a.start, a.end, replacement);
    }
    return out;
  }

  return {
    async push(chunk: string) {
      text += chunk;
      return advance(false);
    },
    async flush() {
      const tail = await advance(true);
      return { tail, stats: { ...stats } };
    },
  };
}

/** AI 없이 — 끝 토막은 자르고 가운데 토막은 지운다(다음 턴 모델 입력용 · 동기) */
export function scrubOddChars(text: string, known = ""): string {
  const k = knownSet(known);
  let out = "";
  let pos = 0;
  for (let a = nextAction(text, pos, true, k); a; a = nextAction(text, pos, true, k)) {
    if (a.kind === "emit") {
      out += text.slice(pos, a.to);
      pos = a.to;
    } else if (a.kind === "replace") {
      out += a.with;
      pos = a.to;
    } else {
      out += text.slice(a.from, a.start);
      pos = afterReplace(text, a.start, a.end, "");
    }
  }
  return out;
}

export function hasOddChars(text: string, known = ""): boolean {
  const k = knownSet(known);
  for (let i = 0; i < text.length; i += step1(text, i)) if (isOddAt(text, i, k)) return true;
  return false;
}

/** 글자만 지운다 — 구조(JSON 따옴표·괄호)를 건드리지 않는다 */
function removeOddLetters(text: string, known: Set<string>): string {
  let out = "";
  for (let i = 0; i < text.length; i += step1(text, i)) if (!isOddAt(text, i, known)) out += charAt(text, i);
  return out;
}

/** 운세 리포트 — 깨졌으면 한 번 다시 만든다. 또 깨지거나 다시 만들기가 실패하면 글자만 지운다 */
export async function generateWithoutOddChars(generate: () => Promise<string>, known = ""): Promise<string> {
  const k = knownSet(known);
  const first = await generate();
  if (!hasOddChars(first, known)) return first;
  try {
    const second = await generate();
    return hasOddChars(second, known) ? removeOddLetters(second, k) : second;
  } catch {
    return removeOddLetters(first, k);
  }
}

const LANGUAGE_ASK_RE = /(일본어|중국어|한자|러시아어|프랑스어|스페인어|독일어|태국어|베트남어|힌디어|아랍어|외국어)(로|를|도)?|번역/;

/** 손님이 다른 언어로 적어 달라고 한 턴 — 이 턴은 거르지 않는다 */
export function askedForOtherLanguage(text: string): boolean {
  return LANGUAGE_ASK_RE.test(text);
}
