// lib/byeolmaru/pair-day.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcSaju, calcTemporalLuck, baseDateForKst } from "@/lib/saju/calc";
import { buildPairCalendar, pairBackdrop, pairDayTone, getPairStaticLine, pairMarks, type PairDayCell, type PairDayTags } from "./pair-day.ts";

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

test("getPairStaticLine: friction 우선 → 톤/태그 폴백, 항상 비지 않은 반말 한 줄", () => {
  const base = { date: "2026-09-07", ganji: "임오", score: 50, isToday: true } as const;
  const mk = (tone: PairDayCell["tone"], tags: Partial<PairDayCell["tags"]>): PairDayCell => ({
    ...base,
    tone,
    tags: { spark: false, bond: false, friction: false, lead: null, ...tags },
  });
  assert.match(getPairStaticLine(mk("caution", { friction: true, spark: true })), /엇갈릴/);
  assert.match(getPairStaticLine(mk("good", { spark: true, bond: true })), /끌림도 결속도/);
  assert.match(getPairStaticLine(mk("good", {})), /순한/);
  assert.match(getPairStaticLine(mk("normal", { spark: true })), /끌림이 도는/);
  assert.match(getPairStaticLine(mk("normal", { bond: true })), /편안하게 이어지는/);
  assert.match(getPairStaticLine(mk("caution", {})), /챙겨주면/);
  assert.match(getPairStaticLine(mk("normal", {})), /무난하게/);
  for (const tone of ["good", "normal", "caution"] as const) {
    assert.ok(getPairStaticLine(mk(tone, {})).length > 0);
  }
});

test("getPairStaticLine: status 있으면 관계 프레이밍이 앞에 얹히고(같은 tone이라도 onesided≠dating), 없으면 기존 톤 문구 그대로(무회귀)", () => {
  const base = { date: "2026-09-07", ganji: "임오", score: 50, isToday: true } as const;
  const mk = (tone: PairDayCell["tone"], tags: Partial<PairDayCell["tags"]>): PairDayCell => ({
    ...base,
    tone,
    tags: { spark: false, bond: false, friction: false, lead: null, ...tags },
  });
  const cell = mk("good", {});
  const plain = getPairStaticLine(cell);
  const onesided = getPairStaticLine(cell, "onesided");
  const dating = getPairStaticLine(cell, "dating");

  assert.equal(getPairStaticLine(cell, null), plain, "status=null(미지정)은 기존 톤 문구 그대로 폴백");
  assert.notEqual(onesided, dating, "같은 tone 이어도 status 가 다르면 문구가 다르다");
  assert.match(onesided, /짝사랑/);
  assert.match(dating, /연애 중/);
  // 프레이밍은 "얹히는" 것 — 기존 톤 문구가 뒤에 그대로 남는다.
  assert.ok(onesided.endsWith(plain));
  assert.ok(dating.endsWith(plain));
});

test("pairMarks: 끌림 ✧ · 결속 ◇ · 삐걱 △ — 순서 고정, lead 는 마크가 아니다", () => {
  const tg = (p: Partial<PairDayTags>): PairDayTags => ({ spark: false, bond: false, friction: false, lead: null, ...p });
  assert.deepEqual(pairMarks(tg({})), []);
  assert.deepEqual(pairMarks(tg({ spark: true })), [{ glyph: "✧", label: "끌림" }]);
  assert.deepEqual(pairMarks(tg({ bond: true })), [{ glyph: "◇", label: "결속" }]);
  assert.deepEqual(pairMarks(tg({ friction: true })), [{ glyph: "△", label: "삐걱" }]);
  // 셀은 첫 마크만 그린다(겹침 실측) — 배열 순서가 곧 우선순위다. 나 탭 dayMarks 와 같은 순서.
  assert.deepEqual(pairMarks(tg({ spark: true, bond: true, friction: true })).map((m) => m.glyph), ["✧", "◇", "△"]);
  // lead 는 두 사람 점수 비교지 "그날의 원인"이 아니다 — 마크로 만들면 끌림을 셀에서 밀어낸다.
  assert.deepEqual(pairMarks(tg({ lead: "me" })), []);
  assert.deepEqual(pairMarks(tg({ lead: "partner" })), []);
});
