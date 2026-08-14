// 정성 이탈조사 설문 — 문항·검증·조합 단일 원천(서버·클라·어드민 공용).
// 문항은 코드 상수(어드민 편집 없음, YAGNI). answers 는 순서대로 string[] 로 받아
// 서버가 문항 텍스트를 결합해 [{q,a}] 로 저장 → 문항을 고쳐도 과거 응답이 온전.
// multi(복수선택) 문항의 a 는 선택 라벨을 " · " 로 조합한 문자열(저장 포맷 [{q,a}] 불변).
// 설계: docs/superpowers/specs/2026-08-14-설문-컨택문항-사용법페이지-design.md

export const SURVEY_MIN_CHARS = 20;
/** 부가입력(체크 시 텍스트) 최대 길이 — " · " 세그먼트 파싱·표시 안정. */
export const MULTI_INPUT_MAX = 40;

export type MultiOption = { id: string; label: string; short?: string; input?: { prompt: string } };

export type SurveyQuestion =
  | { id: string; text: string; type: "text" }
  | { id: string; text: string; type: "multi"; options: MultiOption[] };

// ⚠️ 옵션 라벨은 다른 라벨의 " (" prefix 가 되면 안 된다(parseMultiAnswer 가 조용히 오집계).
//    옵션 추가 시 라벨 충돌 없는지 확인할 것.
/** 컨택 선호 옵션(가정형 리서치 — 실제 발송·PII·동의 수집 아님). short = 어드민 집계 표기용. */
export const CONTACT_OPTIONS: MultiOption[] = [
  { id: "kakao", label: "카카오톡 알림", short: "카톡" },
  { id: "email", label: "이메일", short: "이메일" },
  { id: "sms", label: "문자 메시지", short: "문자" },
  { id: "calendar", label: "내 캘린더에 좋은 날 자동 등록", short: "캘린더", input: { prompt: "어떤 캘린더 써? (예: 구글·애플·네이버)" } },
  { id: "etc", label: "기타", short: "기타", input: { prompt: "어떤 방법이 편해?" } },
];

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  { id: "topic", type: "text", text: "별콩이한테 제일 물어보고 싶은 게 뭐야? (예: 그 사람 속마음, 재회 시점처럼 구체적일수록 좋아)" },
  { id: "quality", type: "text", text: "별콩이랑 얘기해보니 어땠어? 좋았던 것도, 아쉬웠던 것도 솔직하게." },
  { id: "length", type: "text", text: "별콩이 상담이랑 사주·타로 리포트, 분량은 어땠어? 너무 짧거나 길진 않았어?" },
  { id: "revisit", type: "text", text: "별콩톡에 뭐가 더 있으면 자주 놀러 올 것 같아?" },
  { id: "payment", type: "text", text: "별(유료 재화) 충전은 어땠어? 안 했다면 뭐가 망설여졌는지 편하게." },
  { id: "contact", type: "multi", text: "앞으로 별콩이가 좋은 소식이나 그날의 운세를 알려준다면, 어떤 방법이 편할 것 같아? (편한 거 다 골라도 돼)", options: CONTACT_OPTIONS },
  { id: "freeform", type: "text", text: "마지막으로 별콩이한테 하고 싶은 말, 뭐든 적어줘." },
];

export type SurveyAnswer = { q: string; a: string };

/** 부가입력 새니타이즈 — " · " 구분자 오염 방지(공백 치환, 삭제 아님 — 가독성 유지) + 공백 접기 + 길이 캡. */
function sanitizeInput(s: string): string {
  return s.replace(/·/g, " ").replace(/\s+/g, " ").trim().slice(0, MULTI_INPUT_MAX);
}

/** 체크된 옵션(정의 순서)만 세그먼트로 조합. input 옵션은 "label (값)". 미선택=빈 문자열. */
export function composeMultiAnswer(
  options: MultiOption[], checked: string[], inputs: Record<string, string>
): string {
  const segs: string[] = [];
  for (const opt of options) {
    if (!checked.includes(opt.id)) continue;
    segs.push(opt.input ? `${opt.label} (${sanitizeInput(inputs[opt.id] ?? "")})` : opt.label);
  }
  return segs.join(" · ");
}

/** 조합 문자열 → 옵션 id 배열(집계용). 라벨 정확 일치 또는 "label (…)" prefix. 미매칭 무시. */
export function parseMultiAnswer(options: MultiOption[], answer: string): string[] {
  const ids: string[] = [];
  for (const seg of answer.split(" · ")) {
    const s = seg.trim();
    for (const opt of options) {
      if (s === opt.label || s.startsWith(`${opt.label} (`)) { ids.push(opt.id); break; }
    }
  }
  return ids;
}

/** 클라 유효성 — 최소 1개 + input 옵션 체크 시 새니타이즈 후 값 non-empty(원본만 검사하면 "···" 같은 입력이 저장 시 빈값이 되는데도 통과해버림). */
export function isMultiSelectionValid(
  options: MultiOption[], checked: string[], inputs: Record<string, string>
): boolean {
  if (checked.length === 0) return false;
  for (const opt of options) {
    if (checked.includes(opt.id) && opt.input && !sanitizeInput(inputs[opt.id] ?? "")) return false;
  }
  return true;
}

/** 어드민 집계 — 응답들에서 컨택 문항을 찾아 옵션별 카운트 + 응답자 수(복수선택이라 합 > 응답자). */
export function tallyContactAnswers(
  responses: { q: string; a: string }[][]
): { counts: Record<string, number>; respondents: number } {
  const counts: Record<string, number> = {};
  for (const o of CONTACT_OPTIONS) counts[o.id] = 0;
  let respondents = 0;
  const contactQ = SURVEY_QUESTIONS.find((q) => q.id === "contact");
  if (!contactQ) return { counts, respondents };
  for (const answers of responses) {
    const list = Array.isArray(answers) ? answers : [];
    const entry = list.find((qa) => qa && qa.q === contactQ.text && typeof qa.a === "string");
    if (!entry) continue;
    const ids = parseMultiAnswer(CONTACT_OPTIONS, entry.a);
    if (ids.length) respondents++;
    for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
  }
  return { counts, respondents };
}

type ValidateResult =
  | { ok: true; normalized: SurveyAnswer[] }
  | { ok: false; reason: "answer_count" | "too_short" };

/**
 * 클라가 보낸 답변(문항 순서대로 string[])을 검증하고 [{q,a}] 로 정규화.
 * text 는 trim 후 SURVEY_MIN_CHARS 이상, multi 는 non-empty(≥1). 개수는 문항 수와 일치.
 */
export function validateSurveyAnswers(answers: unknown): ValidateResult {
  if (!Array.isArray(answers) || answers.length !== SURVEY_QUESTIONS.length) {
    return { ok: false, reason: "answer_count" };
  }
  const normalized: SurveyAnswer[] = [];
  for (let i = 0; i < SURVEY_QUESTIONS.length; i++) {
    const q = SURVEY_QUESTIONS[i];
    const a = answers[i];
    if (typeof a !== "string") return { ok: false, reason: "too_short" };
    const trimmed = a.trim();
    const min = q.type === "multi" ? 1 : SURVEY_MIN_CHARS;
    if (trimmed.length < min) return { ok: false, reason: "too_short" };
    normalized.push({ q: q.text, a: trimmed });
  }
  return { ok: true, normalized };
}
