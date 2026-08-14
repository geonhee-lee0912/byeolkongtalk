import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateSurveyAnswers,
  SURVEY_QUESTIONS,
  SURVEY_MIN_CHARS,
  CONTACT_OPTIONS,
  MULTI_INPUT_MAX,
  composeMultiAnswer,
  parseMultiAnswer,
  isMultiSelectionValid,
  tallyContactAnswers,
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

test("composeMultiAnswer — 정의 순서로 선택만, input 옵션은 라벨(값)", () => {
  const s = composeMultiAnswer(CONTACT_OPTIONS, ["email", "kakao", "calendar"], { calendar: "구글" });
  assert.equal(s, "카카오톡 알림 · 이메일 · 내 캘린더에 좋은 날 자동 등록 (구글)");
});

test("composeMultiAnswer — 입력 새니타이즈(· 제거·개행 접기·40자 캡)", () => {
  const long = "구글".repeat(50);
  const s = composeMultiAnswer(CONTACT_OPTIONS, ["etc"], { etc: "인스타 · DM\n줄바꿈" });
  assert.equal(s, "기타 (인스타 DM 줄바꿈)");
  const capped = composeMultiAnswer(CONTACT_OPTIONS, ["etc"], { etc: long });
  const seg = capped.replace("기타 (", "").replace(")", "");
  assert.ok(seg.length <= MULTI_INPUT_MAX);
});

test("composeMultiAnswer — · 는 공백으로 치환(가독성)", () => {
  assert.equal(composeMultiAnswer(CONTACT_OPTIONS, ["calendar"], { calendar: "구글·애플" }), "내 캘린더에 좋은 날 자동 등록 (구글 애플)");
});

test("composeMultiAnswer — 미선택은 빈 문자열", () => {
  assert.equal(composeMultiAnswer(CONTACT_OPTIONS, [], {}), "");
});

test("parseMultiAnswer — 조합 문자열을 옵션 id 로 역파싱(라운드트립)", () => {
  const s = composeMultiAnswer(CONTACT_OPTIONS, ["kakao", "calendar", "etc"], { calendar: "애플", etc: "DM" });
  assert.deepEqual(parseMultiAnswer(CONTACT_OPTIONS, s), ["kakao", "calendar", "etc"]);
});

test("parseMultiAnswer — 미매칭 세그먼트는 무시", () => {
  assert.deepEqual(parseMultiAnswer(CONTACT_OPTIONS, "이메일 · 알 수 없음"), ["email"]);
});

test("isMultiSelectionValid — 최소 1개 + input 옵션 체크 시 값 필수", () => {
  assert.equal(isMultiSelectionValid(CONTACT_OPTIONS, [], {}), false);
  assert.equal(isMultiSelectionValid(CONTACT_OPTIONS, ["kakao"], {}), true);
  assert.equal(isMultiSelectionValid(CONTACT_OPTIONS, ["calendar"], {}), false);
  assert.equal(isMultiSelectionValid(CONTACT_OPTIONS, ["calendar"], { calendar: "구글" }), true);
  assert.equal(isMultiSelectionValid(CONTACT_OPTIONS, ["etc"], { etc: "  " }), false);
});

test("isMultiSelectionValid — 새니타이즈 후 빈값이면 무효(· 도배)", () => {
  assert.equal(isMultiSelectionValid(CONTACT_OPTIONS, ["etc"], { etc: "···" }), false);
});

test("tallyContactAnswers — 옵션별 카운트 + 응답자 수(복수선택)", () => {
  const r1 = [{ q: "x", a: "y" }, { q: SURVEY_QUESTIONS.find(q => q.type === "multi")!.text, a: "카카오톡 알림 · 이메일" }];
  const r2 = [{ q: SURVEY_QUESTIONS.find(q => q.type === "multi")!.text, a: "이메일 · 기타 (DM)" }];
  const r3 = [{ q: "무관", a: "무관" }];
  const { counts, respondents } = tallyContactAnswers([r1, r2, r3]);
  assert.equal(respondents, 2);
  assert.equal(counts.email, 2);
  assert.equal(counts.kakao, 1);
  assert.equal(counts.etc, 1);
  assert.equal(counts.sms, 0);
});

test("validateSurveyAnswers — multi 는 비어있지 않으면 통과, text 는 20자", () => {
  const ok = SURVEY_QUESTIONS.map(q => q.type === "multi" ? "이메일" : "a".repeat(20));
  assert.equal(validateSurveyAnswers(ok).ok, true);
  const badLen = SURVEY_QUESTIONS.map((q, i) => q.type === "multi" ? "이메일" : (i === 0 ? "짧음" : "a".repeat(20)));
  assert.equal(validateSurveyAnswers(badLen).ok, false);
  const badMulti = SURVEY_QUESTIONS.map(q => q.type === "multi" ? "" : "a".repeat(20));
  assert.equal(validateSurveyAnswers(badMulti).ok, false);
  assert.equal(validateSurveyAnswers(["only one"]).ok, false);
});
