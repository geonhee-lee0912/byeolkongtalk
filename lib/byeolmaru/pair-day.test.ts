// lib/byeolmaru/pair-day.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcSaju, calcTemporalLuck, baseDateForKst } from "@/lib/saju/calc";
import { buildPairCalendar, pairBackdrop, pairDayTone } from "./pair-day.ts";

const A = calcSaju({ year: 1994, month: 5, day: 12, hour: 9, gender: "female", isLunar: false, isLeapMonth: false });
const B = calcSaju({ year: 1992, month: 11, day: 3, hour: null, gender: "male", isLunar: false, isLeapMonth: false });

test("buildPairCalendar: dailyLuck 길이만큼 셀, score 0~100, tone 정합", () => {
  const t = calcTemporalLuck(baseDateForKst("2026-09-05"), 1994, { includeMonth: true });
  // includeMonth:true 는 항상 dailyLuck 을 채운다(불변식은 lib/saju/calc.test.ts 가 검증) — 타입은
  // DailyLuck[] | undefined 라 여기서 한 번 좁혀서 이후 접근을 전부 non-null 로 만든다.
  const dailyLuck = t.dailyLuck!;
  const cells = buildPairCalendar(A, B, dailyLuck, "2026-09-05");
  assert.equal(cells.length, dailyLuck.length);
  for (const c of cells) {
    assert.ok(c.score >= 0 && c.score <= 100, `score 범위: ${c.score}`);
    assert.equal(c.tone, pairDayTone(c.score));
    assert.equal(typeof c.tags.spark, "boolean");
    assert.ok(c.tags.lead === null || c.tags.lead === "me" || c.tags.lead === "partner");
  }
  assert.equal(cells.filter((c) => c.isToday).length, 1);
});

test("pairDayTone: 임계값 70/45", () => {
  assert.equal(pairDayTone(70), "good");
  assert.equal(pairDayTone(69), "normal");
  assert.equal(pairDayTone(45), "normal");
  assert.equal(pairDayTone(44), "caution");
});

test("pairBackdrop: 라벨·연월조화 노출", () => {
  const bd = pairBackdrop(A, B);
  assert.equal(typeof bd.labelAtoB, "string");
  assert.equal(typeof bd.labelBtoA, "string");
  assert.ok(bd.harmony >= 0 && bd.harmony <= 4);
});
