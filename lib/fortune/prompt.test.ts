import { test } from "node:test";
import assert from "node:assert/strict";
import { fillGuideTokens, SECTION_GUIDE, dailyDateContextLine, buildFortuneSystem } from "./prompt.ts";
import { calcSaju, calcTemporalLuck, baseDateForKst } from "@/lib/saju/calc";

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
  assert.match(line, /과거로 말해/);
  assert.equal(line.includes("앞으로"), false);
});

test("dailyDateContextLine: 앞으로의 날이면 미래 시제를 지시한다", () => {
  const line = dailyDateContextLine("2026-09-21", "2026-09-19")!;
  assert.match(line, /2026-09-21/);
  assert.match(line, /앞으로/);
  assert.match(line, /앞을 보고 말해/);
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
  assert.match(dynamicPart, /그날 날짜: 2026년 9월 12일/);
  assert.equal(/날짜: 2026년 9월 19일/.test(dynamicPart), false);
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

// ── P6-2 daily 템플릿 계약 ─────────────────────────────────────────────
test("SECTION_GUIDE.daily: 문장 예산이 스펙 §6-2 표와 같다(1,800자 = 31~32문장)", () => {
  const g = SECTION_GUIDE.daily;
  assert.match(g, /"intro": "<[^>]*6~7문장/);
  // P6-2 Task10(2026-09-20) 실측 조정으로 love 6→5문장(초과 경향), note 3→4문장(부족 경향).
  assert.match(g, /"key": "love",\s*"body": "<[^>]*5문장/);
  assert.match(g, /"key": "money",\s*"body": "<[^>]*5문장/);
  assert.match(g, /"key": "work",\s*"body": "<[^>]*5문장/);
  assert.match(g, /"key": "health",\s*"body": "<[^>]*4문장/);
  assert.match(g, /"key": "study",\s*"body": "<[^>]*4문장/);
  assert.match(g, /"note": "<[^>]*4문장/);
  assert.equal(/4~5문장/.test(g), false, "옛 4~5문장 지시가 남아 있다");
});

test("SECTION_GUIDE.daily: note 필드 설명에 '별콩이의 한마디' 리터럴이 없다(§11-1-6 프롬프트 쪽 방어)", () => {
  const noteLine = SECTION_GUIDE.daily.split("\n").find((l) => l.includes('"note"'))!;
  assert.equal(/별콩이의 한마디/.test(noteLine), false, noteLine);
  assert.match(noteLine, /머리말|제목/, "머리말 금지 지시가 note 줄에 있어야 한다");
});

test("SECTION_GUIDE.daily: 볼드 1개 고정 + 역할분리 지시가 있다(§6-5·§6-4)", () => {
  const g = SECTION_GUIDE.daily;
  assert.match(g, /굵게[^\n]*정확히 1개|정확히 1개[^\n]*굵게|첫 구절[^\n]*굵게/);
  assert.match(g, /등급[^\n]*다시 말하지|무료[^\n]*떠 있/, "화면에 이미 뜬 무료 요약을 반복하지 말라는 지시");
});

test("SECTION_GUIDE.daily: '오늘' 리터럴은 전부 {{DAY_WORD}} 토큰이다(§11-1-1 시제 절반 해소)", () => {
  // 형식 블록 안에서 그날을 가리키는 '오늘'은 토큰이어야 한다. 남은 '오늘'은 0개.
  assert.equal((SECTION_GUIDE.daily.match(/오늘/g) ?? []).length, 0, SECTION_GUIDE.daily);
  assert.ok((SECTION_GUIDE.daily.match(/\{\{DAY_WORD\}\}/g) ?? []).length >= 8);
});

test("fillGuideTokens: dayWord 기본값은 '오늘', 넘기면 '그날'", () => {
  const g = "{{DAY_WORD}} 들어온 두 글자 / {{DAY_WORD}} 종합운";
  const v = { today: "x", thisMonth: "x", todayPillar: "x", thisMonthPillar: "x" };
  assert.equal(fillGuideTokens(g, v), "오늘 들어온 두 글자 / 오늘 종합운");
  assert.equal(fillGuideTokens(g, { ...v, dayWord: "그날" }), "그날 들어온 두 글자 / 그날 종합운");
});

test("buildFortuneSystem(daily): 대상 날짜가 오늘이 아니면 사주판 일진 블록·형식 블록·지시 줄 전부 '그날'로 말한다", () => {
  // 🔴 라우트는 항상 saju 를 넘긴다 — saju 없이 부르면 sajuBlock 분기가 통째로 빠져
  // "제목은 오늘, 지시는 그날"이던 실제 결함(§11-1-1)을 이 테스트가 놓친다.
  const saju = calcSaju({ year: 1996, month: 4, day: 11, hour: 9, gender: "female", isLunar: false, isLeapMonth: false });
  saju.temporal = calcTemporalLuck(baseDateForKst("2026-09-12"), 1996);
  const { dynamicPart } = buildFortuneSystem("daily", { saju, reportDate: "2026-09-12", todayKst: "2026-09-19" });
  assert.equal((dynamicPart.match(/오늘/g) ?? []).length, 0, dynamicPart); // 데이터 블록·형식 블록·지시 줄 전부
  assert.match(dynamicPart, /그날 들어온 두 글자/);

  // 무회귀 — 오늘 모드(reportDate === todayKst)에서는 사주판 일진 블록도 그대로 "오늘"이다.
  const sajuToday = calcSaju({ year: 1996, month: 4, day: 11, hour: 9, gender: "female", isLunar: false, isLeapMonth: false });
  sajuToday.temporal = calcTemporalLuck(baseDateForKst("2026-09-19"), 1996);
  const today = buildFortuneSystem("daily", { saju: sajuToday, reportDate: "2026-09-19", todayKst: "2026-09-19" }).dynamicPart;
  assert.match(today, /\[오늘 들어온 두 글자/);
});
