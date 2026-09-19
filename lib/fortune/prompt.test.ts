import { test } from "node:test";
import assert from "node:assert/strict";
import { fillGuideTokens, SECTION_GUIDE } from "./prompt.ts";

test("fillGuideTokens: 같은 토큰이 여러 번 나와도 전부 치환된다", () => {
  const guide = [
    `"stars": <오늘 일진({{TODAY_PILLAR}})과 조화>`,
    `"intro": "<'오늘 들어온 두 글자'({{TODAY_PILLAR}}) 풀이>"`,
    `오늘 날짜: {{TODAY}}`,
    `이번 달: {{THIS_MONTH}} / 월건 {{THIS_MONTH_PILLAR}} / 재확인 {{THIS_MONTH_PILLAR}}`,
  ].join("\n");

  const out = fillGuideTokens(guide, {
    today: "2026년 9월 19일 토요일",
    thisMonth: "2026년 9월",
    todayPillar: "병신",
    thisMonthPillar: "정유",
  });

  assert.equal(/\{\{[A-Z_]+\}\}/.test(out), false, `치환 안 된 토큰 잔여: ${out}`);
  assert.equal(out.match(/병신/g)?.length, 2);
  assert.equal(out.match(/정유/g)?.length, 2);
  assert.ok(out.includes("2026년 9월 19일 토요일"));
  assert.ok(out.includes("2026년 9월"));
});

test("fillGuideTokens: 실제 SECTION_GUIDE 전 타입에 잔여 토큰이 없다", () => {
  for (const [type, guide] of Object.entries(SECTION_GUIDE)) {
    const out = fillGuideTokens(guide, {
      today: "2026년 9월 19일 토요일",
      thisMonth: "2026년 9월",
      todayPillar: "병신",
      thisMonthPillar: "정유",
    });
    const left = out.match(/\{\{[A-Z_]+\}\}/g);
    assert.equal(left, null, `${type} 에 치환 안 된 토큰: ${left?.join(", ")}`);
  }
});
