import { test } from "node:test";
import assert from "node:assert/strict";
import { fillGuideTokens, SECTION_GUIDE, dailyDateContextLine, buildFortuneSystem } from "./prompt.ts";

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

test("dailyDateContextLine: 오늘이면 줄을 넣지 않는다", () => {
  assert.equal(dailyDateContextLine("2026-09-19", "2026-09-19"), null);
});

test("dailyDateContextLine: 지난 날이면 과거 시제를 지시한다", () => {
  const line = dailyDateContextLine("2026-09-12", "2026-09-19")!;
  assert.match(line, /2026-09-12/);
  assert.match(line, /지난 날/);
  assert.match(line, /그날/);
  assert.equal(line.includes("앞으로"), false);
});

test("dailyDateContextLine: 앞으로의 날이면 미래 시제를 지시한다", () => {
  const line = dailyDateContextLine("2026-09-21", "2026-09-19")!;
  assert.match(line, /2026-09-21/);
  assert.match(line, /앞으로/);
  assert.match(line, /그날/);
  assert.equal(line.includes("지난 날"), false);
});

test("buildFortuneSystem(daily): reportDate 를 주면 지시 줄과 '오늘 날짜'가 같은 날을 가리킨다", () => {
  const { dynamicPart } = buildFortuneSystem("daily", {
    reportDate: "2026-09-12",
    todayKst: "2026-09-19",
  });
  // 지시 줄이 형식 블록 앞에 들어갔다
  assert.match(dynamicPart, /대상 날짜는 2026-09-12/);
  // 🔴 그리고 템플릿의 '오늘 날짜'도 같은 날이어야 한다 — 서버의 실제 오늘이 박히면 지시와 모순된다.
  assert.match(dynamicPart, /오늘 날짜: 2026년 9월 12일/);
  assert.equal(/오늘 날짜: 2026년 9월 19일/.test(dynamicPart), false);
  // 🔴 샌드위치 — 앞(지시)과 뒤(리마인더) 양쪽에 있어야 한다. 앞에만 두면 템플릿의 "오늘" 반복에 밀린다.
  assert.equal((dynamicPart.match(/그날/g) ?? []).length >= 2, true);
  assert.match(dynamicPart.slice(-300), /2026-09-12/);
});

test("buildFortuneSystem: reportDate 가 없으면 예전 그대로 실제 오늘이 박힌다", () => {
  const { dynamicPart } = buildFortuneSystem("daily", {});
  assert.equal(/대상 날짜는/.test(dynamicPart), false);
  assert.match(dynamicPart, /오늘 날짜: \d{4}년 \d{1,2}월 \d{1,2}일/);
});

test("buildFortuneSystem(daily): todayKst 없이 reportDate 만 오면 날짜를 갈아끼우지 않는다", () => {
  const { dynamicPart } = buildFortuneSystem("daily", { reportDate: "2026-09-12" });
  // 지시 줄이 없으면 날짜도 바뀌면 안 된다 — 모델이 그 날짜를 진짜 오늘로 믿게 되기 때문.
  assert.equal(/대상 날짜는/.test(dynamicPart), false);
  assert.equal(/오늘 날짜: 2026년 9월 12일/.test(dynamicPart), false);
});
