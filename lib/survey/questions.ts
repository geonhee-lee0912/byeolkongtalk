// 정성 이탈조사 설문 — 문항·검증 단일 원천(서버·클라 공용).
// 문항은 코드 상수(어드민 편집 없음, YAGNI). answers 는 순서대로 string[] 로 받아
// 서버가 문항 텍스트를 결합해 [{q,a}] 로 저장 → 문항을 고쳐도 과거 응답이 온전.
// 설계: docs/superpowers/specs/2026-08-09-survey-이탈조사-design.md

// 문항별 최소 글자수 — "성의 강제"가 아니라 빈칸/스페이스 도배 등 어뷰징 방어가 목적.
// trim 후 길이라 공백만 입력은 이미 0자로 거부됨. 낮게 잡아 진입장벽 최소화.
// 단답 자연스러운 문항(분량·결제)도 짧은 한 문장으로 통과. 전체 합산 강제는 없음(몰빵 방지).
export const SURVEY_MIN_CHARS = 20;

export const SURVEY_QUESTIONS = [
  { id: "topic", text: "별콩이한테 제일 물어보고 싶은 게 뭐야? (예: 그 사람 속마음, 재회 시점처럼 구체적일수록 좋아)" },
  { id: "quality", text: "별콩이랑 얘기해보니 어땠어? 좋았던 것도, 아쉬웠던 것도 솔직하게." },
  { id: "length", text: "별콩이 상담이랑 사주·타로 리포트, 분량은 어땠어? 너무 짧거나 길진 않았어?" },
  { id: "revisit", text: "별콩톡에 뭐가 더 있으면 자주 놀러 올 것 같아?" },
  { id: "payment", text: "별(유료 재화) 충전은 어땠어? 안 했다면 뭐가 망설여졌는지 편하게." },
  { id: "freeform", text: "마지막으로 별콩이한테 하고 싶은 말, 뭐든 적어줘." },
] as const;

export type SurveyAnswer = { q: string; a: string };

type ValidateResult =
  | { ok: true; normalized: SurveyAnswer[] }
  | { ok: false; reason: "answer_count" | "too_short" };

/**
 * 클라가 보낸 답변(문항 순서대로 string[])을 검증하고 [{q,a}] 로 정규화.
 * 6개 전부 + 각 trim 후 SURVEY_MIN_CHARS 이상이어야 통과.
 */
export function validateSurveyAnswers(answers: unknown): ValidateResult {
  if (!Array.isArray(answers) || answers.length !== SURVEY_QUESTIONS.length) {
    return { ok: false, reason: "answer_count" };
  }
  const normalized: SurveyAnswer[] = [];
  for (let i = 0; i < SURVEY_QUESTIONS.length; i++) {
    const a = answers[i];
    if (typeof a !== "string") {
      return { ok: false, reason: "too_short" };
    }
    const trimmed = a.trim();
    if (trimmed.length < SURVEY_MIN_CHARS) {
      return { ok: false, reason: "too_short" };
    }
    normalized.push({ q: SURVEY_QUESTIONS[i].text, a: trimmed });
  }
  return { ok: true, normalized };
}
