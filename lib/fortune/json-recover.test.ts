// 운세 리포트 JSON 복구 공용 유틸(parseReportJson/recoverModelJson) 단위 테스트.
// 2026-08-13: prod 검증에서 5개 리포트 종류 중 3개가 "절단이 아니라 모델의 JSON 형식 위반"
// 으로 파싱 실패하는 걸 확인 — 아래 3개 재현 케이스(stray bracket/trailing comma/correction
// 재출력)를 추가하고 복구 단계를 강화한다. 기존 복구(내부 따옴표/raw 개행) 회귀 테스트도 유지.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReportJson } from "./json-recover.ts";

// ── 기존 동작 회귀 가드 ──────────────────────────────────────────────

test("정상 JSON(중첩 객체·배열 포함 큰 리포트)은 그대로 파싱된다", () => {
  const bigReport = {
    theme: "성장하는 한 해",
    summary: "차분히 나아가는 흐름이야. 여러 문단.",
    lucky: { color: "라벤더", direction: "동쪽", months: "3월 · 8월", keyword: "정리" },
    self: {
      nature: "차분하고 신중한 성격이야.",
      strength: "꾸준함과 집중력이 강점이야.",
      caution: "가끔 결정을 미루는 편이야.",
      balance: { lack: "목 기운이 약한 편이야.", supplements: ["초록", "아침 산책"] },
      aptitude: "사람을 돕는 일이 잘 맞아.",
    },
    year: {
      flow: "천천히 쌓아가는 흐름이야.",
      mind: "마음이 편안해지는 시기야.",
      love: "인연이 자연스럽게 다가와.",
      relationship: "주변 사람들과 관계가 깊어져.",
      career: "커리어에 작은 전환점이 있어.",
      wealth: "재물은 안정적으로 흘러.",
      health: "컨디션 관리가 중요해.",
    },
    relations2026: "힘이 되는 인연이 늘어나는 해야.",
    mission: "타고난 강점을 펼치는 게 올해 과제야.",
    monthly: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      body: `${i + 1}월 흐름 설명이야.`,
    })),
    timing: { good: "4 · 9 · 11월", caution: "6 · 7월" },
    actions: ["정리하기", "쉬어가기", "기록하기"],
    note: "별콩이가 응원할게.",
  };
  const raw = JSON.stringify(bigReport);
  const ai = parseReportJson(raw);
  assert.ok(ai);
  assert.deepEqual(ai, bigReport);
});

test("문자열 안 raw 개행이 있어도 복구해서 파싱 (기존 recoverModelJson 회귀)", () => {
  const raw =
    '{"theme":"성장","summary":"첫 문단이야.\n\n두 번째 문단이야.","note":"응원할게."}';
  const ai = parseReportJson(raw);
  assert.ok(ai, "raw 개행 포함 JSON 을 복구 파싱해야 한다");
  assert.match(ai!.summary as string, /두 번째 문단/);
});

test("문자열 안 escape 안 된 내부 큰따옴표를 복구해서 파싱 (기존 recoverModelJson 회귀)", () => {
  const raw =
    '{"theme":"성장","advice":"가볍게 "요즘 어때?" 같은 말로 문을 열어봐.","note":"끝."}';
  const ai = parseReportJson(raw);
  assert.ok(ai, "내부 따옴표를 복구해서 파싱해야 한다");
  assert.match(ai!.advice as string, /요즘 어때/);
});

test("코드펜스로 감싸도 파싱", () => {
  const raw = "```json\n" + JSON.stringify({ theme: "성장", note: "끝." }) + "\n```";
  assert.ok(parseReportJson(raw));
});

test("완전히 깨진 입력(JSON 없음)은 null", () => {
  assert.equal(parseReportJson("그냥 텍스트, JSON 없음"), null);
});

test("중간에 끊긴(truncated) JSON은 복구하지 않고 null — 절단은 이 유틸의 책임이 아니다", () => {
  const raw = '{"theme":"성장","summary":"이 리포트는 중간에 끊';
  assert.equal(parseReportJson(raw), null);
});

test("절단된 JSON은 본문 어딘가에 무관한 '}' 가 있어도 null (스캔 오탐 방지)", () => {
  // note 문자열 값 "안"에 등장하는 '{}' 는 최상위 구조가 아니다 — 이걸 후보로 오인해
  // 스캔을 재시작하면 안 되고, 진짜 최상위 객체가 끝까지 안 닫혔으니 null 이어야 한다.
  const raw =
    '{"theme":"성장","note":"참고로 JSON 객체는 {} 로 표기해","summary":"이 리포트는 중간에 끊';
  assert.equal(parseReportJson(raw), null);
});

// ── 패턴 1: stray closing bracket ────────────────────────────────────

test("[패턴1] 문자열 값 뒤 짝 안 맞는 ']' 를 버리고 복구 파싱 (재현 케이스)", () => {
  // 모델이 배열이 열리지 않은 자리에 ']' 를 잘못 뱉은 상황 — 기존엔 JSON.parse
  // "Unexpected token ']'" 로 실패 → null → 리포트 전체 폐기.
  const raw =
    '{"grade":"천생연분","summary":"우리는 참 잘 맞는 인연이야."],"chemistry":"오행이 잘 어울려서 편안한 사이야."}';
  const ai = parseReportJson(raw);
  assert.ok(ai, "stray bracket 을 버리고 파싱해야 한다");
  assert.equal(ai!.grade, "천생연분");
  assert.equal(ai!.summary, "우리는 참 잘 맞는 인연이야.");
  assert.equal(ai!.chemistry, "오행이 잘 어울려서 편안한 사이야.");
});

// ── 패턴 2: trailing comma ───────────────────────────────────────────

test("[패턴2] 객체 끝 직전 trailing comma 를 제거하고 복구 파싱 (재현 케이스)", () => {
  const raw = '{"theme":"성장하는 한 해","aptitude":"사람을 살리는 일이 잘 맞아.",}';
  const ai = parseReportJson(raw);
  assert.ok(ai, "trailing comma 를 제거하고 파싱해야 한다");
  assert.equal(ai!.theme, "성장하는 한 해");
  assert.equal(ai!.aptitude, "사람을 살리는 일이 잘 맞아.");
});

test("[패턴2] 배열 끝 직전 trailing comma 도 제거하고 복구 파싱 (재현 케이스)", () => {
  const raw = '{"actions":["정리하기","쉬어가기",],"note":"끝."}';
  const ai = parseReportJson(raw);
  assert.ok(ai, "배열 trailing comma 도 제거하고 파싱해야 한다");
  assert.deepEqual(ai!.actions, ["정리하기", "쉬어가기"]);
});

// ── 패턴 3: "correction" 재출력 ───────────────────────────────────────

test("[패턴3] 잘못된 첫 객체 뒤 '수정본' 텍스트 + 두 번째 완결 객체가 오면 두 번째를 파싱 (재현 케이스)", () => {
  // 모델이 콜론 없이 잘못 뱉은 첫 객체 다음에 "**JSON 형식 오류 수정본:**" 같은 텍스트를 넣고
  // 두 번째(유효한) 객체를 다시 뱉는 상황. 기존엔 첫 '{' ~ 마지막 '}' 를 통째로 잘라 두 객체
  // + 중간 텍스트가 뒤섞인 문자열을 파싱 시도 → 반드시 실패 → null.
  const brokenFirst = '{"grade" "천생연분" "summary" "아직 다듬는 중"}';
  const correctionNote = "\n\n**JSON 형식 오류 수정본:**\n\n";
  const validSecond =
    '{"grade":"천생연분","summary":"우리는 참 잘 맞는 인연이야.","chemistry":"오행이 잘 어울려."}';
  const raw = brokenFirst + correctionNote + validSecond;

  const ai = parseReportJson(raw);
  assert.ok(ai, "두 번째 완결 객체를 찾아 파싱해야 한다");
  assert.equal(ai!.grade, "천생연분");
  assert.equal(ai!.summary, "우리는 참 잘 맞는 인연이야.");
  assert.equal(ai!.chemistry, "오행이 잘 어울려.");
});

test("[패턴3 · Critical 회귀] 첫 객체가 형식은 멀쩡하지만 내용이 틀린 draft 여도 마지막(정답) 객체를 반환한다 (구분자 있음)", () => {
  // adversarial 리뷰 재현: 첫 객체가 syntactically valid 하면(콜론 누락 같은 구조 오류가 아니라
  // "보통"/"다시 계산 중" 같은 스스로 고칠 값 오류) attempt1 에서 바로 JSON.parse 가 성공해버려
  // "첫 성공 후보 반환" 전략이 stale draft 를 채택하는 회귀. 정답은 항상 모델이 나중에 다시
  // 뱉는 마지막 객체 — parseReportJson 은 후보를 뒤에서부터 시도해야 한다.
  const staleDraft = '{"grade":"보통","summary":"다시 계산 중"}';
  const correctionNote = "\n**수정본:**\n";
  const finalAnswer =
    '{"grade":"천생연분","summary":"우리는 참 잘 맞는 인연이야.","chemistry":"오행이 잘 어울려."}';
  const raw = staleDraft + correctionNote + finalAnswer;

  const ai = parseReportJson(raw);
  assert.ok(ai);
  assert.equal(ai!.grade, "천생연분", "stale draft(보통) 가 아니라 마지막 정답을 반환해야 한다");
  assert.equal(ai!.summary, "우리는 참 잘 맞는 인연이야.");
  assert.equal(ai!.chemistry, "오행이 잘 어울려.");
});

test("[패턴3 · Critical 회귀] 구분 텍스트 없이 두 객체가 바로 붙어있어도 마지막(정답) 객체를 반환한다", () => {
  // "**수정본:**" 같은 안내 문구 없이 모델이 그냥 객체 두 개를 연달아 뱉는 경우도 같은 버그.
  const staleDraft = '{"grade":"보통","summary":"다시 계산 중"}';
  const finalAnswer =
    '{"grade":"천생연분","summary":"우리는 참 잘 맞는 인연이야.","chemistry":"오행이 잘 어울려."}';
  const raw = staleDraft + finalAnswer; // 구분자 없이 바로 붙임

  const ai = parseReportJson(raw);
  assert.ok(ai);
  assert.equal(ai!.grade, "천생연분", "stale draft(보통) 가 아니라 마지막 정답을 반환해야 한다");
  assert.equal(ai!.summary, "우리는 참 잘 맞는 인연이야.");
  assert.equal(ai!.chemistry, "오행이 잘 어울려.");
});

// ── 보강: 중첩 구조 · 정상 JSON 안전성 ─────────────────────────────────

test("[패턴2 보강] 배열 안 중첩 객체 뒤 trailing comma 도 복구 (재현 케이스)", () => {
  const raw =
    '{"monthly":[{"month":1,"body":"1월 흐름."},{"month":2,"body":"2월 흐름."},],"note":"끝."}';
  const ai = parseReportJson(raw);
  assert.ok(ai, "중첩 배열 안 trailing comma 도 제거하고 파싱해야 한다");
  assert.deepEqual(ai!.monthly, [
    { month: 1, body: "1월 흐름." },
    { month: 2, body: "2월 흐름." },
  ]);
});

test("문자열 값 안에 구조 문자·이모지·'수정본' 문구가 있어도 원본과 byte-identical하게 파싱된다 (구조 오인 방지)", () => {
  // summary 안에 {},[],  콤마, 이모지, 그리고 "correction 재출력" 트리거 문구("**수정본**")
  // 까지 전부 텍스트로 들어있는 정상 JSON. 이걸 구조로 오인해 잘라내거나 바꾸면 안 된다.
  const tricky = {
    theme: "성장",
    summary:
      "배열은 [1,2,3] 이렇게 쓰고 객체는 {a:1} 이렇게 써 🌟 그리고 **수정본** 이라는 말도 그냥 텍스트야, 쉼표도 있어.",
    note: "끝.",
  };
  const raw = JSON.stringify(tricky);
  const ai = parseReportJson(raw);
  assert.deepEqual(ai, JSON.parse(raw));
  assert.deepEqual(ai, tricky);
});
