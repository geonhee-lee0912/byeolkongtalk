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
  PAIR_NARRATIVE_MAX_TOKENS,
  buildCardReportSystem,
  CARD_REPORT_KICKOFF,
  CARD_REPORT_MAX_TOKENS,
  CARD_REPORT_MODEL,
} from "./narrative-prompt.ts";
import { buildCalendar, monthRange } from "./calendar.ts";
import type { DayCell } from "./calendar.ts";
import { DAY_NAME } from "./day-label.ts";
import { PAIR_REPORT_BLOCKS } from "./pair-report.ts";
import { PAIR_PAID_CHARS } from "./paywall-sections.ts";

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
  // 🔴 2026-09-24 자유 줄글 → 5블록 JSON. 예전엔 "마커 없이 줄글만"을 단정했는데, 이제 마커(JSON)가
  //    형식 자체라 그 단정은 뜻이 뒤집혔다. 서식 계약은 불릿·제목 금지 쪽으로 옮겨갔다.
  assert.ok(/반말/.test(sys) && /단정/.test(sys) && /불릿·콜아웃·제목·번호 금지/.test(sys));
  assert.ok(!/줄글만/.test(sys), "옛 자유 줄글 지시가 남아 있으면 안 된다");
  assert.ok(PAIR_NARRATIVE_KICKOFF.length > 0);
});

test("buildPairNarrativeSystem: 좋은 날 목록 → 관계-타이밍 지침 + 목록에서만 가드(택일 보완①)", () => {
  const a = calcSaju({ year: 1996, month: 4, day: 11, hour: 9, gender: "female", isLunar: false, isLeapMonth: false });
  const b = calcSaju({ year: 1994, month: 11, day: 3, hour: 21, gender: "male", isLunar: false, isLeapMonth: false });
  const t = calcTemporalLuck(baseDateForKst("2026-09-05"), 1996, { includeMonth: true });
  const cell = buildPairCalendar(a, b, t.dailyLuck!, "2026-09-05")[0];
  const bd = pairBackdrop(a, b);
  const good: PairDayCell[] = [
    { date: "2026-09-12", ganji: "무술", score: 80, tone: "good", tags: { spark: true, sparkBoth: false, bond: false, bondBoth: false, friction: false, lead: "me" }, isToday: false },
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

// I-4 정정 — goodDays 의 "이번 달 말일까지 클램프"는 buildPairNarrativeSystem 안이 아니라
// 호출부(app/api/byeolmaru/pair-narrative/route.ts)에 있다. 이 저장소엔 API 라우트를 직접
// 부르는 테스트 인프라가 없어(app/api/**/*.test.ts 0개, QA 하네스/브라우저 E2E 로 대체하는 관례)
// 라우트를 그대로 호출하는 대신 route.ts 와 똑같은 클램프 식(c.date <= monthEnd)을 여기서
// 재현해 monthRange 경계값이 실제로 다음 달 날짜를 걸러내는지 + 걸러진 목록이 프롬프트에
// 정확히 반영되는지를 검증한다.
test("buildPairNarrativeSystem: 이번 달 말일 클램프(I-4) — 다음 달 좋은 날은 목록에 안 남는다", () => {
  const a = calcSaju({ year: 1996, month: 4, day: 11, hour: 9, gender: "female", isLunar: false, isLeapMonth: false });
  const b = calcSaju({ year: 1994, month: 11, day: 3, hour: 21, gender: "male", isLunar: false, isLeapMonth: false });
  const t = calcTemporalLuck(baseDateForKst("2026-09-28"), 1996, { includeMonth: true });
  const cell = buildPairCalendar(a, b, t.dailyLuck!, "2026-09-28")[0];
  const bd = pairBackdrop(a, b);

  const { end: monthEnd } = monthRange("2026-09-28");
  assert.equal(monthEnd, "2026-09-30", "9월 말일 기준값이 어긋났다");

  const rawGoodDays: PairDayCell[] = [
    { date: "2026-09-30", ganji: "무술", score: 80, tone: "good", tags: { spark: true, sparkBoth: false, bond: false, bondBoth: false, friction: false, lead: null }, isToday: false },
    { date: "2026-10-03", ganji: "경자", score: 82, tone: "good", tags: { spark: false, sparkBoth: false, bond: true, bondBoth: false, friction: false, lead: null }, isToday: false },
  ];
  // route.ts 의 실제 클램프 식을 그대로 재현.
  const clamped = rawGoodDays.filter((c) => c.date <= monthEnd);

  const sys = buildPairNarrativeSystem(a, b, bd, cell, "임오", "지우", clamped);
  assert.ok(sys.includes("9월 30일"), "이번 달 안 좋은 날은 남아야 한다");
  assert.ok(!sys.includes("10월 3일"), "다음 달 좋은 날은 클램프로 빠져야 한다(달력에 없는 날 추천 방지)");
  assert.ok(sys.includes("이번 달 중"), "문구가 '이번 달' 기준으로 바뀌어야 한다");
  assert.ok(!sys.includes("앞으로 30일"), "'앞으로 30일' 문구가 남아있으면 안 된다");
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

test("buildCardReportSystem: 카드·정역·사주·일진·등급 그라운딩 + 7블록 JSON 형식 + 문장 예산", () => {
  const a = calcSaju({ year: 1996, month: 4, day: 11, hour: 9, gender: "female", isLunar: false, isLeapMonth: false });
  const card = getCard(36)!; // 컵 에이스
  const grade = { label: "잘 맞는 날", tone: "good" } as const;
  const axes = { love: 63, work: 55, money: 40 };
  const gauge = { love: { base: 63, delta: 12 }, money: { base: 40, delta: 0 }, work: { base: 55, delta: 0 } };
  const sys = buildCardReportSystem({
    saju: a, card, reversed: false, todayGanji: "임오", todayKst: "2026-09-20",
    grade, axes, gauge, freeTaste: "안녕, 나 별콩이야. 컵 에이스는 마음이 새로 차오르는 카드야.",
  });
  assert.ok(sys.includes(card.name_kr));
  assert.match(sys, /정위/);
  assert.ok(sys.includes("임오") && sys.includes("잘 맞는 날"));
  for (const k of ["place", "love", "work", "mind", "caution", "move", "note"]) assert.ok(sys.includes(`"${k}"`), k);
  assert.match(sys, /"place": "<[^>]*8문장/);
  assert.match(sys, /"love": "<[^>]*6문장/);
  assert.match(sys, /"mind": "<[^>]*5문장/);
  // P6-2 Task10(2026-09-20) 실측 조정으로 caution 4→5문장, note 3→4문장(card-report.ts 주석 참조).
  assert.match(sys, /"caution": "<[^>]*5문장/);
  assert.match(sys, /"note": "<[^>]*4문장/);
  assert.equal(/700~900자|흐르는 줄글/.test(sys), false, "구 자유 줄글 지시가 남아 있다");
});

test("buildCardReportSystem: 역할분리 — 화면에 뜬 무료 taste 를 알고, 상징 재설명·반복을 막는다(§6-4)", () => {
  const a = calcSaju({ year: 1996, month: 4, day: 11, hour: 9, gender: "female", isLunar: false, isLeapMonth: false });
  const card = getCard(0)!;
  const gauge = { love: { base: 50, delta: 6 }, money: { base: 50, delta: 6 }, work: { base: 50, delta: 6 } };
  const taste = "완벽한 타이밍을 기다리기보다, 지금 낼 수 있는 추진력으로 밀고 나가는 게 오늘은 더 잘 맞아.";
  const sys = buildCardReportSystem({
    saju: a, card, reversed: false, todayGanji: "임오", todayKst: "2026-09-20",
    grade: { label: "무난한 날", tone: "normal" }, axes: { love: 50, money: 50, work: 50 }, gauge, freeTaste: taste,
  });
  assert.ok(sys.includes(taste), "무료 taste 원문이 프롬프트에 있어야 '이건 이미 말했다'가 된다");
  assert.match(sys, /상징[^\n]*(다시|재)설명[^\n]*(마|금지)/);
  assert.match(sys, /어디에 떨어지|어떻게 부딪|어디서 받쳐/);
  const noTaste = buildCardReportSystem({
    saju: a, card, reversed: true, todayGanji: "임오", todayKst: "2026-09-20",
    grade: { label: "무난한 날", tone: "normal" }, axes: { love: 50, money: 50, work: 50 }, gauge, freeTaste: null,
  });
  assert.match(noTaste, /역위/);
});

test("buildCardReportSystem: 게이지 보정이 말로 들어가고 숫자 누출은 금지된다", () => {
  const a = calcSaju({ year: 1996, month: 4, day: 11, hour: 9, gender: "female", isLunar: false, isLeapMonth: false });
  const cups = getCard(36)!;
  const base = {
    saju: a, card: cups, todayGanji: "임오", todayKst: "2026-09-20",
    grade: { label: "무난한 날", tone: "normal" } as const, axes: { love: 50, money: 50, work: 50 }, freeTaste: null,
  };
  const up = buildCardReportSystem({ ...base, reversed: false, gauge: { love: { base: 50, delta: 12 }, money: { base: 50, delta: 0 }, work: { base: 50, delta: 0 } } });
  assert.match(up, /연애[^\n]*살짝 밀어올/);
  const rev = buildCardReportSystem({ ...base, reversed: true, gauge: { love: { base: 50, delta: -12 }, money: { base: 50, delta: 0 }, work: { base: 50, delta: 0 } } });
  assert.match(rev, /연애[^\n]*살짝 눌러/);
  assert.match(up, /숫자[^\n]*(말하지|쓰지) ?마/);
});

test("buildCardReportSystem: all-도메인 메이저는 게이지 3축 반복 대신 한 문장으로 축약된다", () => {
  const a = calcSaju({ year: 1996, month: 4, day: 11, hour: 9, gender: "female", isLunar: false, isLeapMonth: false });
  const fool = getCard(0)!; // 바보 — MAJOR_DOMAIN[0] === "all"
  const base = {
    saju: a, card: fool, todayGanji: "임오", todayKst: "2026-09-20",
    grade: { label: "무난한 날", tone: "normal" } as const, axes: { love: 50, money: 50, work: 50 }, freeTaste: null,
  };
  const up = buildCardReportSystem({
    ...base, reversed: false,
    gauge: { love: { base: 50, delta: 6 }, money: { base: 50, delta: 6 }, work: { base: 50, delta: 6 } },
  });
  assert.match(up, /세 축 모두 살짝 밀어올려/);
  assert.equal((up.match(/(연애|돈|일) 축을 살짝/g) ?? []).length, 0, "축약 후엔 개별 축 3연 반복 문구가 하나도 남으면 안 된다");

  const rev = buildCardReportSystem({
    ...base, reversed: true,
    gauge: { love: { base: 50, delta: -6 }, money: { base: 50, delta: -6 }, work: { base: 50, delta: -6 } },
  });
  assert.match(rev, /세 축 모두 살짝 눌러/);
  assert.equal((rev.match(/(연애|돈|일) 축을 살짝/g) ?? []).length, 0);
});

test("buildCardReportSystem: 2인칭·반말·단정 금지·볼드 1개·note 머리말 금지 규칙", () => {
  const a = calcSaju({ year: 1996, month: 4, day: 11, hour: 9, gender: "female", isLunar: false, isLeapMonth: false });
  const sys = buildCardReportSystem({
    saju: a, card: getCard(7)!, reversed: false, todayGanji: "임오", todayKst: "2026-09-20",
    grade: { label: "무난한 날", tone: "normal" }, axes: { love: 50, money: 50, work: 50 },
    gauge: { love: { base: 50, delta: 0 }, money: { base: 50, delta: 0 }, work: { base: 50, delta: 12 } }, freeTaste: null,
  });
  assert.match(sys, /2인칭|'너'/);
  assert.match(sys, /반말/);
  assert.match(sys, /단정/);
  assert.match(sys, /굵게[^\n]*정확히 1개|첫 구절[^\n]*굵게/);
  const noteLine = sys.split("\n").find((l) => l.includes('"note"'))!;
  assert.equal(/별콩이의 한마디/.test(noteLine), false, noteLine);
  assert.ok(CARD_REPORT_KICKOFF.length > 0);
  assert.ok(CARD_REPORT_MAX_TOKENS >= 5000, "1,800자 JSON(스펙 §6-2 고정 목표) + 헤드룸");
  assert.equal(CARD_REPORT_MODEL, "gpt-5.6-luna");
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

test("pair 프롬프트: 5블록 JSON 형식 + 문장 예산이 목표 분량과 맞고 토큰 상한이 감당한다", () => {
  const a = calcSaju({ year: 1996, month: 4, day: 11, hour: 9, gender: "female", isLunar: false, isLeapMonth: false });
  const b = calcSaju({ year: 1994, month: 11, day: 3, hour: 21, gender: "male", isLunar: false, isLeapMonth: false });
  const t = calcTemporalLuck(baseDateForKst("2026-09-05"), 1996, { includeMonth: true });
  const cell = buildPairCalendar(a, b, t.dailyLuck!, "2026-09-05")[0];
  const sys = buildPairNarrativeSystem(a, b, pairBackdrop(a, b), cell, "임오", "지우");

  // 🔴 5블록 키가 **전부** 프롬프트에 뜬다. 스키마(PAIR_REPORT_SCHEMA)와 프롬프트가 갈라지면
  //    모델이 스키마엔 있는데 지시가 없는 키를 빈 값으로 채우고, 파서가 통째로 null 을 돌린다.
  for (const b2 of PAIR_REPORT_BLOCKS) {
    assert.ok(sys.includes(`"${b2.key}"`), `블록 키 ${b2.key} 가 프롬프트에 없다`);
    assert.ok(sys.includes(`${b2.sentences}문장`), `블록 ${b2.key} 의 문장 예산이 프롬프트에 없다`);
  }
  assert.ok(sys.includes("아래 JSON 하나만"), "JSON 단독 출력 지시가 없다");
  assert.ok(!sys.includes("3~4문단"), "옛 분량 지시(3~4문단 ≈ 600자)가 남아 있으면 안 된다");
  assert.ok(!sys.includes("1,100~1,300자"), "자유 줄글 시절 분량 지시가 남아 있으면 안 된다");

  // 목표 글자수가 정본이고 문장 수는 수단이다(card-report.ts P6-2 Task10 교훈) — 둘이 어긋나면
  // 여기서 잡는다. 문장×50 이 관례 환산.
  const budget = PAIR_REPORT_BLOCKS.reduce((n, x) => n + x.sentences, 0) * 50;
  assert.equal(budget, PAIR_PAID_CHARS, `문장 예산 합 ${budget}자 와 목표 ${PAIR_PAID_CHARS}자 가 어긋났다`);

  // nano 는 추론 토큰이 max 안에 함께 카운트된다 — 본문 1,300자(≈720토큰) + JSON 키·escape 오버헤드에 추론 헤드룸.
  assert.ok(PAIR_NARRATIVE_MAX_TOKENS >= 3600, `상한 ${PAIR_NARRATIVE_MAX_TOKENS} 은 ${PAIR_PAID_CHARS}자에 부족하다`);
  // 실측(런타임)에서 "마무리로 한 줄의 따뜻한 결론을 남겨보면" 류로 프롬프트 지시를 본문이 그대로
  // 읊는 결함이 나왔다 — 구조 설명형 도입부 금지 한 줄을 유지한다(블록 단위로 문구만 옮겼다).
  assert.ok(sys.includes("글의 구조를 설명하는 말로 블록을 열지"), "구조 설명형 도입부 금지 지침이 있어야 한다");
});
