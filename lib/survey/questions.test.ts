import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateSurveyAnswers,
  SURVEY_QUESTIONS,
  SURVEY_MIN_CHARS,
} from "./questions.ts";

const long = "가".repeat(SURVEY_MIN_CHARS); // 정확히 최소 길이
const six = () => SURVEY_QUESTIONS.map(() => long);

test("6개 전부 최소 글자수 충족 → ok + 문항 텍스트 결합", () => {
  const r = validateSurveyAnswers(six());
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.normalized.length, SURVEY_QUESTIONS.length);
    assert.equal(r.normalized[0].q, SURVEY_QUESTIONS[0].text);
    assert.equal(r.normalized[0].a, long);
  }
});

test("개수 부족 → fail(answer_count)", () => {
  assert.deepEqual(validateSurveyAnswers(six().slice(0, 5)), {
    ok: false,
    reason: "answer_count",
  });
});

test("하나라도 최소 미만 → fail(too_short)", () => {
  const a = six();
  a[2] = "가".repeat(SURVEY_MIN_CHARS - 1);
  assert.deepEqual(validateSurveyAnswers(a), { ok: false, reason: "too_short" });
});

test("공백 채움은 trim 후 판정 → fail(too_short)", () => {
  const a = six();
  // raw 길이는 60(≥50)이지만 trim 하면 0자 — trim 을 안 하고 a.length 만 보면
  // 통과해버리므로, 이 케이스가 trim 게이트 자체를 pin 한다.
  a[0] = " ".repeat(60);
  assert.deepEqual(validateSurveyAnswers(a), { ok: false, reason: "too_short" });
});

test("정상 통과 시 normalized.a 는 trim 된 값 (앞뒤 공백 제거 확인)", () => {
  const padded = "  " + long + "  ";
  const r = validateSurveyAnswers(SURVEY_QUESTIONS.map(() => padded));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.normalized[0].a, long);
  }
});

test("원소가 non-string(예: null) → fail(too_short)", () => {
  const a: unknown[] = six();
  a[3] = null;
  assert.deepEqual(validateSurveyAnswers(a), { ok: false, reason: "too_short" });
});

test("배열 아님 → fail(answer_count)", () => {
  assert.deepEqual(validateSurveyAnswers("nope"), { ok: false, reason: "answer_count" });
  assert.deepEqual(validateSurveyAnswers(null), { ok: false, reason: "answer_count" });
});
