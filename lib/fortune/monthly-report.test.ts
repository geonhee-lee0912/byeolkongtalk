import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMonthlyReportJson } from "./monthly-report.ts";

const validReport = {
  stars: 3,
  theme: "정리하고 새 흐름을 여는 달",
  summary: "차분히 나아가는 흐름이야.",
  lucky: { keyword: "정리", color: "라벤더" },
  intro: "월건 두 글자 풀이야.",
  weekly: [
    { week: 1, body: "1주차 흐름." },
    { week: 2, body: "2주차 흐름." },
    { week: 3, body: "3주차 흐름." },
    { week: 4, body: "4주차 흐름." },
  ],
  sections: [
    { key: "money", body: "재물운." },
    { key: "work", body: "직장운." },
    { key: "love", body: "애정운." },
    { key: "health", body: "건강운." },
    { key: "study", body: "학업운." },
  ],
  timing: { good: "상순이 좋아.", caution: "하순은 점검." },
  balance: { good: "정리하기.", warn: "무리 금물." },
  note: "별콩이가 응원할게.",
};

test("정상 JSON 파싱", () => {
  const ai = parseMonthlyReportJson(JSON.stringify(validReport));
  assert.ok(ai);
  assert.equal(ai.weekly.length, 4);
  assert.equal(ai.sections.length, 5);
});

test("free-text 필드 안 raw 개행이 있어도 복구해서 파싱 (재발 케이스)", () => {
  // 프롬프트가 '줄바꿈 넣지 마'라 지시해도 모델이 긴 본문에서 escape 안 된 실제 개행을
  // 뱉으면 기존엔 JSON.parse 실패 → "monthly report parse failed" 로 리딩 삭제 + 환불.
  // 아래 문자열 리터럴의 \n 은 이미 실제 개행 문자 — escape 안 된 개행을 JSON 안에 심는다.
  const raw = JSON.stringify(validReport).replace(
    '"재물운."',
    '"재물운 첫 문단.\n\n두 번째 문단."'
  );
  assert.ok(raw.includes("\n"), "테스트 입력에 실제 개행이 들어있어야 한다");
  const ai = parseMonthlyReportJson(raw);
  assert.ok(ai, "raw 개행 포함 JSON 을 복구 파싱해야 한다");
  assert.match(ai.sections[0].body, /두 번째 문단/);
});

test("코드펜스로 감싸도 파싱", () => {
  const raw = "```json\n" + JSON.stringify(validReport) + "\n```";
  assert.ok(parseMonthlyReportJson(raw));
});

test("완전히 깨진 입력은 null", () => {
  assert.equal(parseMonthlyReportJson("그냥 텍스트, JSON 없음"), null);
});
