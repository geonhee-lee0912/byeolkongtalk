// lib/byeolmaru/card-gauge.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { getCard, getAllTarotCards } from "@/lib/tarot/cards";
import {
  cardDomain,
  cardGauge,
  gaugeFinal,
  gaugeSpan,
  MAX_CARD_DELTA,
  MAJOR_DOMAIN,
  type CardGauge,
} from "./card-gauge.ts";

const AXES = { love: 50, money: 50, work: 50 };

test("cardDomain: 마이너 슈트 → 도메인(컵=연애·펜타클=돈·완드/소드=일)", () => {
  // id 22~35 완드, 36~49 컵, 50~63 소드, 64~77 펜타클 (lib/tarot/cards.ts 순서)
  assert.equal(cardDomain(getCard(22)!), "work");
  assert.equal(cardDomain(getCard(36)!), "love");
  assert.equal(cardDomain(getCard(50)!), "work");
  assert.equal(cardDomain(getCard(64)!), "money");
});

test("cardDomain: 메이저 22장 전부 태그가 있다(누락이면 all 폴백이 아니라 실패)", () => {
  for (let id = 0; id <= 21; id++) {
    // ["love","money","work","all"].includes(d) 만으론 폴백 "all" 을 그냥 통과시켜 표가 지워져도
    // 초록이 된다 — 실제 키 존재를 직접 본다(값은 튜닝 대상이라 여기 복제하지 않는다).
    assert.ok(id in MAJOR_DOMAIN, `메이저 ${id} 태그 누락`);
    const d = cardDomain(getCard(id)!);
    assert.ok(["love", "money", "work", "all"].includes(d), `id ${id}`);
  }
  assert.equal(cardDomain(getCard(6)!), "love", "연인은 연애");
  assert.equal(cardDomain(getCard(7)!), "work", "전차는 일");
  assert.equal(cardDomain(getCard(0)!), "all", "바보는 전체");
});

test("cardGauge: 컵 정위 → 연애만 +, 나머지 0 / 역위 → 연애만 −", () => {
  const up = cardGauge(AXES, getCard(36)!, false);
  assert.equal(up.love.base, 50);
  assert.ok(up.love.delta > 0);
  assert.equal(up.money.delta, 0);
  assert.equal(up.work.delta, 0);
  const rev = cardGauge(AXES, getCard(36)!, true);
  assert.equal(rev.love.delta, -up.love.delta);
});

test("cardGauge: 메이저 'all' 은 세 축 모두 같은 크기로, 단일 도메인보다 작게", () => {
  const g = cardGauge(AXES, getCard(0)!, false);
  assert.ok(g.love.delta > 0 && g.love.delta === g.money.delta && g.money.delta === g.work.delta);
  const single = cardGauge(AXES, getCard(36)!, false);
  assert.ok(g.love.delta < single.love.delta);
  // 관계형 단언(>0, all<single)만으론 DOMAIN_DELTA=1·ALL_DELTA=0.5 같은 축소도 통과한다 —
  // 그러면 금색 덧칠이 트랙의 1%(모바일 ~2.5px)로 사실상 안 보이고, 소수 delta 는 gaugeFinal 의
  // Math.round 에 먹혀 lo===hi(막대 폭 0)인데 라벨엔 "+0.4" 가 뜨는 불일치가 생긴다. 정수 + 최소 폭을 고정한다.
  assert.ok(Number.isInteger(single.love.delta) && Number.isInteger(g.love.delta));
  assert.ok(single.love.delta >= 8 && g.love.delta >= 4, "금색이 보일 최소 폭");
});

test("cardGauge: 78장×정역 전부 |delta| ≤ MAX_CARD_DELTA(15) — 카드가 하루를 뒤집지 않는다", () => {
  assert.ok(MAX_CARD_DELTA <= 15);
  for (const c of getAllTarotCards()) {
    for (const rev of [false, true]) {
      const g = cardGauge(AXES, c, rev);
      for (const k of ["love", "money", "work"] as const) {
        assert.ok(Math.abs(g[k].delta) <= MAX_CARD_DELTA, `${c.id} ${rev} ${k} ${g[k].delta}`);
      }
    }
  }
});

test("gaugeFinal: base+delta 를 0~100 으로 클램프", () => {
  const g: CardGauge = {
    love: { base: 95, delta: 12 },
    money: { base: 3, delta: -12 },
    work: { base: 50, delta: 0 },
  };
  assert.equal(gaugeFinal(g.love), 100);
  assert.equal(gaugeFinal(g.money), 0);
  assert.equal(gaugeFinal(g.work), 50);
});

test("gaugeSpan: 정위(delta>0) → base < final, sign +1", () => {
  const span = gaugeSpan({ base: 50, delta: 12 });
  assert.equal(span.base, 50);
  assert.equal(span.final, 62);
  assert.ok(span.base < span.final);
  assert.equal(span.lo, 50);
  assert.equal(span.hi, 62);
  assert.equal(span.sign, 1);
});

test("gaugeSpan: 역위(delta<0) → base > final, sign -1", () => {
  const span = gaugeSpan({ base: 50, delta: -12 });
  assert.ok(span.base > span.final);
  assert.equal(span.lo, 38);
  assert.equal(span.hi, 50);
  assert.equal(span.sign, -1);
});

test("gaugeSpan: delta 0 → lo === hi(막대 폭 0), sign 0", () => {
  const span = gaugeSpan({ base: 50, delta: 0 });
  assert.equal(span.base, span.final);
  assert.equal(span.lo, span.hi);
  assert.equal(span.sign, 0);
});

test("gaugeSpan: base 95 + delta 12 → final 은 100 에서 클램프(hi 도 100)", () => {
  const span = gaugeSpan({ base: 95, delta: 12 });
  assert.equal(span.final, 100);
  assert.equal(span.hi, 100);
  assert.equal(span.lo, 95);
});
