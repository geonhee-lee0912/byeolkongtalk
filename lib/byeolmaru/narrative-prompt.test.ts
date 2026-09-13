import { test } from "node:test";
import assert from "node:assert/strict";
import { calcSaju, calcTemporalLuck, baseDateForKst } from "@/lib/saju/calc";
import { getCard } from "@/lib/tarot/cards";
import { pairBackdrop, buildPairCalendar } from "./pair-day.ts";
import type { PairDayCell } from "./pair-day.ts";
import {
  buildTeaserLine,
  buildNarrativeSystem,
  buildPairNarrativeSystem,
  PAIR_NARRATIVE_KICKOFF,
  buildCardNarrativeSystem,
  CARD_NARRATIVE_KICKOFF,
} from "./narrative-prompt.ts";
import { buildCalendar } from "./calendar.ts";
import type { DayCell } from "./calendar.ts";
import { DAY_NAME } from "./day-label.ts";

const CELL = {
  date: "2026-09-04", ganji: "辛巳", element: "금",
  grade: { label: "아주 좋은 날", tone: "good" }, axes: { love: 63, money: 40, work: 55 },
  score: 70, isToday: true,
} as unknown as DayCell;

test("buildTeaserLine — 정적 첫 줄이 비지 않고 반말·별콩이 톤", () => {
  const line = buildTeaserLine(CELL);
  assert.equal(typeof line, "string");
  assert.ok(line.length > 10);
  assert.ok(!/입니다|습니다/.test(line));
});

test("buildPairNarrativeSystem: 두 사람·너희 결·오늘 신호 + 마커금지 규칙", () => {
  const a = calcSaju({ year: 1996, month: 4, day: 11, hour: 9, gender: "female", isLunar: false, isLeapMonth: false });
  const b = calcSaju({ year: 1994, month: 11, day: 3, hour: 21, gender: "male", isLunar: false, isLeapMonth: false });
  const t = calcTemporalLuck(baseDateForKst("2026-09-05"), 1996, { includeMonth: true });
  const cell = buildPairCalendar(a, b, t.dailyLuck!, "2026-09-05")[0];
  const bd = pairBackdrop(a, b);
  const sys = buildPairNarrativeSystem(a, b, bd, cell, "임오", "지우");
  assert.ok(sys.includes("우리 오늘"));
  assert.ok(sys.includes("지우"));
  assert.ok(sys.includes(bd.labelAtoB));
  assert.ok(/반말/.test(sys) && /단정/.test(sys) && /마커 없이|줄글만/.test(sys));
  assert.ok(PAIR_NARRATIVE_KICKOFF.length > 0);
});

test("buildPairNarrativeSystem: 좋은 날 목록 → 관계-타이밍 지침 + 목록에서만 가드(택일 보완①)", () => {
  const a = calcSaju({ year: 1996, month: 4, day: 11, hour: 9, gender: "female", isLunar: false, isLeapMonth: false });
  const b = calcSaju({ year: 1994, month: 11, day: 3, hour: 21, gender: "male", isLunar: false, isLeapMonth: false });
  const t = calcTemporalLuck(baseDateForKst("2026-09-05"), 1996, { includeMonth: true });
  const cell = buildPairCalendar(a, b, t.dailyLuck!, "2026-09-05")[0];
  const bd = pairBackdrop(a, b);
  const good: PairDayCell[] = [
    { date: "2026-09-12", ganji: "무술", score: 80, tone: "good", tags: { spark: true, bond: false, friction: false, lead: "me" }, isToday: false },
  ];

  const withGood = buildPairNarrativeSystem(a, b, bd, cell, "임오", "지우", good);
  assert.ok(withGood.includes("9월 12일"), "좋은 날 날짜가 목록에 뜬다");
  assert.ok(withGood.includes("목록에서만"), "목록에서만 가드(환각 날짜 방지)");
  assert.ok(withGood.includes("관계 타이밍"), "관계 타이밍 지침");

  // 무회귀: 빈 목록이면 타이밍 지침 없음
  const without = buildPairNarrativeSystem(a, b, bd, cell, "임오", "지우", []);
  assert.ok(!without.includes("목록에서만"), "빈 목록엔 타이밍 지침 없음");

  // 오늘 셀은 목록에서 제외(오늘 얘기는 본문이 함)
  const onlyToday = buildPairNarrativeSystem(a, b, bd, cell, "임오", "지우", [{ ...good[0], date: cell.date }]);
  assert.ok(!onlyToday.includes("목록에서만"), "오늘만 있는 목록은 라인 안 생김");
});

test("buildPairNarrativeSystem: status 있으면 관계 상태 라인 주입, 없으면 라인 없음(무회귀)", () => {
  const a = calcSaju({ year: 1996, month: 4, day: 11, hour: 9, gender: "female", isLunar: false, isLeapMonth: false });
  const b = calcSaju({ year: 1994, month: 11, day: 3, hour: 21, gender: "male", isLunar: false, isLeapMonth: false });
  const t = calcTemporalLuck(baseDateForKst("2026-09-05"), 1996, { includeMonth: true });
  const cell = buildPairCalendar(a, b, t.dailyLuck!, "2026-09-05")[0];
  const bd = pairBackdrop(a, b);

  const withStatus = buildPairNarrativeSystem(a, b, bd, cell, "임오", "지우", [], "onesided");
  assert.ok(withStatus.includes("짝사랑"), "관계 상태 라벨이 주입된다");
  assert.ok(withStatus.includes("이 관계 결을 반영해서 말해"), "관계 결 반영 지침이 함께 붙는다");

  const withoutStatus = buildPairNarrativeSystem(a, b, bd, cell, "임오", "지우");
  assert.ok(!withoutStatus.includes("이 관계 결을 반영해서 말해"), "status 없으면 관계 상태 라인 없음(무회귀)");
});

test("buildCardNarrativeSystem: 카드명·정역·규칙·오늘 축·분량·4비트 지침", () => {
  const a = calcSaju({ year: 1996, month: 4, day: 11, hour: 9, gender: "female", isLunar: false, isLeapMonth: false });
  const card = getCard(0)!;
  const grade = { label: "잘 맞는 날", tone: "good" } as const;
  const axes = { love: 63, work: 55, money: 40 };
  const sys = buildCardNarrativeSystem(a, card, false, "임오", grade, axes);
  assert.ok(sys.includes(card.name_kr));
  assert.ok(/정위|역위/.test(sys));
  assert.ok(/반말/.test(sys) && /단정/.test(sys));
  assert.ok(sys.includes("잘 맞는 날"), "오늘 등급 라벨 그라운딩");
  assert.ok(sys.includes("연애 63") && sys.includes("일 55"), "오늘 애정·일 축 그라운딩");
  assert.ok(/700~900자|흐르는 줄글/.test(sys), "~800자 분량 지침");
  assert.ok(/애정|관계/.test(sys) && /조언/.test(sys), "4비트(애정+조언) 구성 지침");
  assert.ok(CARD_NARRATIVE_KICKOFF.length > 0);
});

test("buildNarrativeSystem — 화면에 뜬 하루 이름을 프롬프트가 알고, 재설명을 막는다", () => {
  const saju = calcSaju({ year: 1996, month: 4, day: 11, hour: 9, gender: "female", isLunar: false, isLeapMonth: false });
  const t = calcTemporalLuck(baseDateForKst("2026-09-05"), 1996, { includeMonth: true });
  const daily = t.dailyLuck;
  if (!daily) throw new Error("dailyLuck 필요");
  const cell = buildCalendar(saju, daily, "2026-09-05")[0];
  const sys = buildNarrativeSystem(saju, cell, "갑자");
  assert.ok(sys.includes(DAY_NAME[cell.tenGod]), "하루 이름이 프롬프트에 없다");
  assert.ok(sys.includes(cell.tenGod), "십신 키가 프롬프트에 없다");
  assert.ok(/다시 설명하지 말고/.test(sys), "재설명 금지 지시가 없다");
});
