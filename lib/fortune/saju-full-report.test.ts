import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSajuFullReport,
  serializeSajuFullReport,
  tryParseStoredSajuFullReport,
  sajuYearSpecByYear,
  isSajuYearType,
  SAJU_YEAR_SPECS,
  type SajuFullReportAI,
} from "./saju-full-report.ts";

const AI: SajuFullReportAI = {
  theme: "테마",
  summary: "요약",
  lucky: { color: "빨강", direction: "남", months: "3월", keyword: "연결" },
  self: {
    nature: "기질",
    strength: "강점",
    caution: "보완",
    balance: { lack: "부족", supplements: ["물"] },
    aptitude: "적성",
  },
  year: {
    flow: "흐름",
    mind: "마음",
    love: "사랑",
    relationship: "관계",
    career: "일",
    wealth: "재물",
    health: "건강",
  },
  relations2026: "인연",
  mission: "과제",
  monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, body: `${i + 1}월` })),
  timing: { good: "4월", caution: "6월" },
  actions: ["하나", "둘", "셋"],
  note: "한마디",
} as SajuFullReportAI;

test("saju_2027 저장본은 정미년 yearPillar 를 갖는다", () => {
  const r = buildSajuFullReport(AI, "saju_2027");
  assert.deepEqual(r.yearPillar, { year: 2027, stem: "정", branch: "미", hanja: "丁未" });
});

test("saju_full 저장본은 병오년 yearPillar 를 갖는다", () => {
  const r = buildSajuFullReport(AI, "saju_full");
  assert.deepEqual(r.yearPillar, { year: 2026, stem: "병", branch: "오", hanja: "丙午" });
});

test("직렬화 왕복이 yearPillar 를 지킨다", () => {
  const r = tryParseStoredSajuFullReport(serializeSajuFullReport(buildSajuFullReport(AI, "saju_2027")));
  assert.ok(r);
  assert.equal(r.yearPillar.year, 2027);
  assert.equal(r.yearPillar.hanja, "丁未");
});

test("옛 2026 저장본(year2026 만 있음)은 2026 yearPillar 로 읽힌다", () => {
  const legacy = JSON.stringify({ v: 1, ...AI, year2026: { stem: "병", branch: "오", hanja: "丙午" } });
  const r = tryParseStoredSajuFullReport(legacy);
  assert.ok(r, "옛 저장본이 안 열린다");
  assert.deepEqual(r.yearPillar, { year: 2026, stem: "병", branch: "오", hanja: "丙午" });
});

test("연도 표기가 아예 없으면 저장본이 아니다", () => {
  assert.equal(tryParseStoredSajuFullReport(JSON.stringify({ v: 1, ...AI })), null);
});

test("연도 사양 조회", () => {
  assert.equal(sajuYearSpecByYear(2027)?.type, "saju_2027");
  assert.equal(sajuYearSpecByYear(2026)?.type, "saju_full");
  assert.equal(sajuYearSpecByYear(2025), null);
  assert.equal(isSajuYearType("saju_2027"), true);
  assert.equal(isSajuYearType("monthly"), false);
  assert.equal(isSajuYearType(null), false);
  assert.equal(SAJU_YEAR_SPECS.saju_2027.ganjiKr, "정미");
});
