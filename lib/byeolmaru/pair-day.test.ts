// lib/byeolmaru/pair-day.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcSaju, calcTemporalLuck, baseDateForKst, calcDailyLuckRange } from "@/lib/saju/calc";
import { buildPairCalendar, pairBackdrop, pairDayTone, pairMarks, type PairDayCell, type PairDayTags } from "./pair-day.ts";
import { dayFactors, dayScore } from "./day-score.ts";
import { toDaySelf } from "./calendar.ts";

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

test("pairMarks: 설렘 ✧ · 척척 ◇ · 삐걱 △ — 순서 고정, lead 는 마크가 아니다", () => {
  const tg = (p: Partial<PairDayTags>): PairDayTags => ({
    spark: false, sparkBoth: false, bond: false, bondBoth: false, friction: false, lead: null, ...p,
  });
  assert.deepEqual(pairMarks(tg({})), []);
  // V4: 한 명만 걸리면 half(*Both 기본값 false) — "둘 다 걸리면 full"은 아래 별도 테스트가 덮는다.
  assert.deepEqual(pairMarks(tg({ spark: true })), [{ glyph: "✧", label: "설렘", strength: "half" }]);
  assert.deepEqual(pairMarks(tg({ bond: true })), [{ glyph: "◇", label: "척척", strength: "half" }]);
  // 🔴 삐걱은 한 명만 충이어도 full — 점수(-14)가 가중되지 않으니 시각도 깎지 않는다.
  assert.deepEqual(pairMarks(tg({ friction: true })), [{ glyph: "△", label: "삐걱", strength: "full" }]);
  // 셀은 첫 마크만 그린다(겹침 실측) — 배열 순서가 곧 우선순위다. 나 탭 dayMarks 와 같은 순서.
  assert.deepEqual(pairMarks(tg({ spark: true, bond: true, friction: true })).map((m) => m.glyph), ["✧", "◇", "△"]);
  // lead 는 두 사람 점수 비교지 "그날의 원인"이 아니다 — 마크로 만들면 설렘을 셀에서 밀어낸다.
  assert.deepEqual(pairMarks(tg({ lead: "me" })), []);
  assert.deepEqual(pairMarks(tg({ lead: "partner" })), []);
});

test("V4 — 한 명만 끌리면 절반, 둘 다면 full", () => {
  const half = pairMarks({ spark: true, sparkBoth: false, bond: false, bondBoth: false, friction: false, lead: null });
  const full = pairMarks({ spark: true, sparkBoth: true, bond: false, bondBoth: false, friction: false, lead: null });
  assert.equal(half[0].strength, "half");
  assert.equal(full[0].strength, "full");
});

test("V4 — baseline 이 점수에서 빠졌다: 궁합이 좋아도 달 전체가 들리지 않는다", () => {
  // 🔴 대조 단정: 사건 없는 날의 점수가 "두 사람 각자 점수의 평균" 그대로여야 한다.
  //    baseline 이 남아 있으면 배경(천간합/육합/harmony)이 있는 쌍에서 그만큼 높게 나온다.
  const a = calcSaju({ year: 1994, month: 5, day: 12, hour: 9, gender: "female", isLunar: false, isLeapMonth: false });
  const b = calcSaju({ year: 1992, month: 11, day: 3, hour: null, gender: "male", isLunar: false, isLeapMonth: false });
  const luck = calcDailyLuckRange("2026-09-01", "2026-09-30");
  const backdrop = pairBackdrop(a, b);
  const cells = buildPairCalendar(a, b, luck, "2026-09-20");

  const noSignal = cells.filter((c) => !c.tags.spark && !c.tags.bond && !c.tags.friction);
  assert.ok(noSignal.length > 0, "사건 없는 날이 있어야 이 단정이 의미가 있다");
  for (const c of noSignal) {
    const d = luck.find((x) => x.date === c.date);
    assert.ok(d, `${c.date} 일진이 표본에 있어야 한다`);
    const dl = { stem: d.stem, branch: d.branch, element: d.element };
    const solo = (dayScore(dayFactors(toDaySelf(a), dl)) + dayScore(dayFactors(toDaySelf(b), dl))) / 2;
    assert.equal(c.score, Math.round(solo), `${c.date}: 사건 없는 날은 두 사람 평균 그대로여야 한다`);
  }
  // backdrop 자체는 계속 나간다 — 배경 설명("너희 결")이 그걸 쓴다.
  assert.equal(typeof backdrop.harmony, "number");
});
