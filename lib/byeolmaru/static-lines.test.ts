import { test } from "node:test";
import assert from "node:assert/strict";
import { getCardLine, getCardTaste, getSkeletonLine, getSajuTaste, getPairTaste } from "./static-lines.ts";
import skeletonLines from "@/data/byeolmaru/skeleton-lines.json";
import sajuTaste from "@/data/byeolmaru/saju-taste.json";
import cardTaste from "@/data/byeolmaru/card-taste.json";
import pairTasteBank from "@/data/byeolmaru/pair-taste.json";
import { getCardCount } from "@/lib/tarot/cards";
import type { DayTone } from "./day-score.ts";
import type { ElementRelation } from "@/lib/saju/pairing";
import type { PairDayTags, PairTone } from "./pair-day.ts";
import type { RelationshipStatus } from "@/lib/relationship/types";

const TONES: DayTone[] = ["good", "normal", "caution"];
const RELATIONS: ElementRelation[] = ["생아", "아극", "비화", "아생", "극아"];

// 금지 문자 — 화면에 그대로 노출되면 안 되는 것(별콩 화법: 별표·마커·제목).
function assertClean(s: string, where: string) {
  assert.ok(!s.includes("**"), `${where}: 마크다운 별표 금지`);
  assert.ok(!s.includes("[RECO"), `${where}: RECO 마커 금지`);
  assert.ok(!s.startsWith("#"), `${where}: 제목 금지`);
}

test("card-lines: 78카드 전부 · 정/역 비어있지 않음 · 금지문자 없음", () => {
  assert.equal(getCardCount(), 78, "카드 총수 = 뱅크 키 범위 전제");
  for (let id = 0; id < 78; id++) {
    const up = getCardLine(id, false);
    const rv = getCardLine(id, true);
    assert.ok(up && up.trim().length > 0, `card ${id} upright 존재`);
    assert.ok(rv && rv.trim().length > 0, `card ${id} reversed 존재`);
    assertClean(up, `card ${id} upright`);
    assertClean(rv, `card ${id} reversed`);
    assert.notEqual(up, rv, `card ${id} 정/역 다른 문장`);
  }
});

test("card-lines: 뱅크 밖 id 는 null(호출측 폴백)", () => {
  assert.equal(getCardLine(78, false), null);
  assert.equal(getCardLine(-1, true), null);
});

test("skeleton: 3 tone × 5 relation = 15조합 전부 · 조합 문장 존재 · 금지문자 없음", () => {
  for (const t of TONES) {
    for (const r of RELATIONS) {
      const line = getSkeletonLine(t, r, "2026-09-05");
      assert.ok(line && line.trim().length > 0, `${t}/${r} 존재`);
      assert.ok(line.startsWith("오늘은 ") && line.includes("이라, "), `${t}/${r} 조각 조합 템플릿`);
      assertClean(line, `${t}/${r}`);
    }
  }
});

test("skeleton: 로테이션 결정론 — 같은 (tone,relation,date) 는 늘 같은 문장", () => {
  for (const t of TONES) {
    for (const r of RELATIONS) {
      const a = getSkeletonLine(t, r, "2026-09-05");
      const b = getSkeletonLine(t, r, "2026-09-05");
      assert.equal(a, b, `${t}/${r} 결정론`);
    }
  }
});

test("skeleton: 조각 조합이 30일간 다양한 문장을 낸다(반복 완화)", () => {
  // 조각 조합 = relation 3 × tone 4 = 조합당 12출력. 30일 돌리면 여러 개가 나와야(고정 3보다 다양).
  const seen = new Set<string>();
  for (let d = 1; d <= 30; d++) {
    const date = `2026-09-${String(d).padStart(2, "0")}`;
    const line = getSkeletonLine("good", "생아", date);
    if (line) seen.add(line);
  }
  assert.ok(seen.size >= 5, `good/생아 30일이 5개 이상 다른 문장을 커버(실제 ${seen.size})`);
});

test("skeleton: 조각 뱅크 완전성 — relation 5종·tone 3종 각 ≥3조각", () => {
  const raw = skeletonLines as { relation: Record<string, string[]>; tone: Record<string, string[]> };
  for (const r of RELATIONS) assert.ok((raw.relation[r]?.length ?? 0) >= 3, `relation ${r} ≥3조각`);
  for (const t of TONES) assert.ok((raw.tone[t]?.length ?? 0) >= 3, `tone ${t} ≥3조각`);
});

test("skeleton: 뱅크 밖 조합은 null(호출측 폴백)", () => {
  assert.equal(getSkeletonLine("good", "없는관계" as ElementRelation, "2026-09-05"), null);
});

test("saju-taste: 유효 셀 → 5섹션(전반/연애/일/돈/조언) 전부 non-empty", () => {
  const t = getSajuTaste("good", { love: 70, money: 50, work: 55 }, "생아", "2026-09-05");
  assert.ok(t.overall.trim().length > 0, "overall 존재");
  assert.ok(t.love.trim().length > 0, "love 존재");
  assert.ok(t.work.trim().length > 0, "work 존재");
  assert.ok(t.money.trim().length > 0, "money 존재");
  assert.ok(t.advice.trim().length > 0, "advice 존재");
});

test("saju-taste: tasteBand 임계값 — love 70→high, 50→mid, 40→low 뱅크에서 뽑힘", () => {
  const raw = sajuTaste as { love: Record<string, string[]> };
  const high = getSajuTaste("good", { love: 70, money: 50, work: 50 }, "비화", "2026-09-05");
  assert.ok(raw.love.high.includes(high.love), "70점은 high 뱅크 소속");
  const mid = getSajuTaste("good", { love: 50, money: 50, work: 50 }, "비화", "2026-09-05");
  assert.ok(raw.love.mid.includes(mid.love), "50점은 mid 뱅크 소속");
  const low = getSajuTaste("good", { love: 40, money: 50, work: 50 }, "비화", "2026-09-05");
  assert.ok(raw.love.low.includes(low.love), "40점은 low 뱅크 소속");
});

test("saju-taste: 결정론 — 같은 입력은 늘 같은 결과", () => {
  const a = getSajuTaste("caution", { love: 40, money: 60, work: 45 }, "극아", "2026-09-10");
  const b = getSajuTaste("caution", { love: 40, money: 60, work: 45 }, "극아", "2026-09-10");
  assert.deepEqual(a, b);
});

test("saju-taste: 뱅크 완전성 — tone 3종(overall)·밴드 3종(love/work/money)·relation 5종(advice) 전부 non-empty", () => {
  for (const tone of TONES) {
    const t = getSajuTaste(tone, { love: 50, money: 50, work: 50 }, "비화", "2026-09-05");
    assert.ok(t.overall.trim().length > 0, `overall/${tone} 존재`);
  }
  const bandScores: { band: string; score: number }[] = [
    { band: "high", score: 70 },
    { band: "mid", score: 50 },
    { band: "low", score: 30 },
  ];
  for (const { band, score } of bandScores) {
    const t = getSajuTaste("normal", { love: score, money: score, work: score }, "비화", "2026-09-05");
    assert.ok(t.love.trim().length > 0, `love/${band} 존재`);
    assert.ok(t.work.trim().length > 0, `work/${band} 존재`);
    assert.ok(t.money.trim().length > 0, `money/${band} 존재`);
  }
  for (const relation of RELATIONS) {
    const t = getSajuTaste("normal", { love: 50, money: 50, work: 50 }, relation, "2026-09-05");
    assert.ok(t.advice.trim().length > 0, `advice/${relation} 존재`);
  }
});

test("saju-taste: 경계값 — love 65→high, 64→mid, 45→mid, 44→low", () => {
  const raw = sajuTaste as { love: Record<string, string[]> };
  const at = (score: number) => getSajuTaste("good", { love: score, money: 50, work: 50 }, "비화", "2026-09-05").love;
  assert.ok(raw.love.high.includes(at(65)), "65 = high");
  assert.ok(raw.love.mid.includes(at(64)), "64 = mid");
  assert.ok(raw.love.mid.includes(at(45)), "45 = mid");
  assert.ok(raw.love.low.includes(at(44)), "44 = low");
});

test("saju-taste: 날짜-간 반복 완화 — 밴드 고정 60일에서 각 슬롯이 충분히 바뀐다(avalanche 회귀 가드)", () => {
  // 🔴 salt 나눗셈 버그 회귀 가드: hashDate 가 하루 +1 이라 floor(h/salt) 식은 한 슬롯을 salt 일
  // 고정시켜 같은 문장이 반복됐다(리뷰 실측 money 91%·advice 89%). avalanche 로 흩뿌리면 날짜-간
  // 변경률이 독립 기준(len2≈50%·len3≈67%)에 붙는다. 밴드/톤/관계 고정으로 픽커만 격리 — 25% 미만이면 실패.
  const start = Date.parse("2026-01-01T00:00:00Z");
  const N = 60;
  const KEYS = ["overall", "love", "work", "money", "advice"] as const;
  const changes: Record<(typeof KEYS)[number], number> = { overall: 0, love: 0, work: 0, money: 0, advice: 0 };
  let prev: ReturnType<typeof getSajuTaste> | null = null;
  for (let i = 0; i < N; i++) {
    const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
    const t = getSajuTaste("good", { love: 75, money: 70, work: 72 }, "생아", date);
    if (prev) {
      for (const k of KEYS) {
        if (t[k] !== prev[k]) changes[k]++;
      }
    }
    prev = t;
  }
  for (const k of KEYS) {
    const rate = changes[k] / (N - 1);
    assert.ok(rate >= 0.25, `${k} 날짜-간 변경률 ${(rate * 100).toFixed(0)}% ≥25%(반복 고정 아님)`);
  }
});

test("saju-taste: 반환 5섹션 금지문자 없음", () => {
  const t = getSajuTaste("good", { love: 70, money: 55, work: 60 }, "생아", "2026-09-05");
  for (const [k, v] of Object.entries(t)) assertClean(v, `saju-taste ${k}`);
});

// ── 1C 무료 오늘의 카드 taste (~350자 본문 + 날짜별 인사말) ────────────────────────
const DATE = "2026-09-12";

test("card-taste: 78카드 전부 · 정/역 비어있지 않음 · 금지문자·영어 없음 · 정≠역", () => {
  for (let id = 0; id < 78; id++) {
    const up = getCardTaste(id, false, DATE);
    const rv = getCardTaste(id, true, DATE);
    assert.ok(up && up.trim().length > 0, `card ${id} upright taste 존재`);
    assert.ok(rv && rv.trim().length > 0, `card ${id} reversed taste 존재`);
    assertClean(up!, `card ${id} up taste`);
    assertClean(rv!, `card ${id} rv taste`);
    // 무료 데일리는 별콩 화법(영어 금지). 본문·인사말 모두 한글이어야.
    assert.ok(!/[A-Za-z]/.test(up!), `card ${id} up 영어 없음`);
    assert.ok(!/[A-Za-z]/.test(rv!), `card ${id} rv 영어 없음`);
    assert.notEqual(up, rv, `card ${id} 정/역 다른 문장(같은 날 같은 인사말이라 본문 차이로만 갈림)`);
  }
});

test("card-taste: 뱅크 완전성 — 0~77 각 upright/reversed non-empty", () => {
  const raw = cardTaste as Record<string, { upright: string; reversed: string }>;
  for (let id = 0; id < 78; id++) {
    const e = raw[String(id)];
    assert.ok(e, `card-taste[${id}] 존재`);
    assert.ok(e.upright?.trim().length > 0, `card-taste[${id}].upright`);
    assert.ok(e.reversed?.trim().length > 0, `card-taste[${id}].reversed`);
  }
});

test("card-taste: 분량 — 완성본(인사말+본문) 300자 이상(한 줄 회귀 가드) · 700자 이하", () => {
  for (let id = 0; id < 78; id++) {
    for (const reversed of [false, true]) {
      const s = getCardTaste(id, reversed, DATE)!;
      const n = [...s].length;
      assert.ok(n >= 300, `card ${id} ${reversed ? "역" : "정"} 완성 ${n}자 ≥300(옛 한 줄 아님)`);
      assert.ok(n <= 700, `card ${id} ${reversed ? "역" : "정"} 완성 ${n}자 ≤700(런어웨이 아님)`);
    }
  }
});

test("card-taste: 뱅크 밖 id 는 null(호출측 폴백)", () => {
  assert.equal(getCardTaste(78, false, DATE), null);
  assert.equal(getCardTaste(-1, true, DATE), null);
});

test("card-taste: 인사말 로테이션 결정론 — 같은 (id,정역,date) 는 늘 같은 문장", () => {
  assert.equal(getCardTaste(0, false, DATE), getCardTaste(0, false, DATE));
  assert.equal(getCardTaste(13, true, "2026-01-01"), getCardTaste(13, true, "2026-01-01"));
});

test("card-taste: 인사말이 날짜별로 다양 — 같은 카드 30일에 3종 이상 다른 완성본", () => {
  // 본문은 카드 고정이라, 완성본이 날짜별로 달라지려면 인사말이 로테이션돼야 한다.
  const start = Date.parse("2026-01-01T00:00:00Z");
  const seen = new Set<string>();
  for (let i = 0; i < 30; i++) {
    const date = new Date(start + i * 86400000).toISOString().slice(0, 10);
    const s = getCardTaste(0, false, date);
    if (s) seen.add(s);
  }
  assert.ok(seen.size >= 3, `30일 인사말 다양성 ${seen.size}종 ≥3`);
});

// ── P5-5 우리 오늘 무료 taste ──────────────────────────────────────────────
const PAIR_TONES: PairTone[] = ["good", "normal", "caution"];
const STATUSES: (RelationshipStatus | null)[] = ["crush", "dating", "breakup", "onesided", null];
const tg = (p: Partial<PairDayTags>): PairDayTags => ({
  spark: false, sparkBoth: false, bond: false, bondBoth: false, friction: false, lead: null, ...p,
});
const TAG_CASES: PairDayTags[] = [
  tg({}),
  tg({ spark: true, lead: "me" }),
  tg({ bond: true, lead: "partner" }),
  tg({ spark: true, bond: true }),
  tg({ friction: true, lead: "me" }),
  tg({ spark: true, friction: true, lead: "partner" }),
];

test("pair-taste: 모든 (tone × tags × status) 조합이 4슬롯을 채우고 금지문자가 없다", () => {
  for (const tone of PAIR_TONES) {
    for (const tags of TAG_CASES) {
      for (const status of STATUSES) {
        const t = getPairTaste(tone, tags, status, "2026-09-14");
        for (const [slot, v] of Object.entries(t)) {
          assert.ok(v.trim().length > 0, `${tone}/${status}/${slot} 비어있음`);
          assertClean(v, `${tone}/${status}/${slot}`);
        }
      }
    }
  }
});

test("pair-taste: 슬롯 자수 밴드와 합계 — 무료는 ~350자다(유료 1,200자의 29%)", () => {
  // 실측 밴드(저작 원고): signal 101~134 · relation 76~93 · lead 72~92 · advice 43~49.
  // 🔴 밴드를 넓히지 말고 문장을 고쳐라 — 이 규율이 무료/유료 depth 비율(스펙 §8)을 지킨다.
  for (const tone of PAIR_TONES) {
    for (const tags of TAG_CASES) {
      for (const status of STATUSES) {
        const t = getPairTaste(tone, tags, status, "2026-09-14");
        assert.ok(t.signal.length >= 95 && t.signal.length <= 140, `signal 자수 ${t.signal.length}`);
        assert.ok(t.relation.length >= 70 && t.relation.length <= 100, `relation 자수 ${t.relation.length}`);
        assert.ok(t.lead.length >= 68 && t.lead.length <= 95, `lead 자수 ${t.lead.length}`);
        assert.ok(t.advice.length >= 40 && t.advice.length <= 55, `advice 자수 ${t.advice.length}`);
        const total = t.signal.length + t.relation.length + t.lead.length + t.advice.length;
        assert.ok(total >= 290 && total <= 370, `합계 ${total}자`);
      }
    }
  }
});

test("pair-taste: signal 키 우선순위 friction > 끌림+결속 > 끌림 > 결속 > tone", () => {
  const bank = pairTasteBank as unknown as { signal: Record<string, string[]> };
  const pick = (tone: PairTone, tags: PairDayTags) => getPairTaste(tone, tags, null, "2026-09-14").signal;
  // 삐걱이 있으면 다른 신호가 같이 떠도 friction 뱅크에서 나온다(옛 getPairStaticLine 규칙 계승).
  assert.ok(bank.signal.friction.includes(pick("good", tg({ friction: true, spark: true, bond: true }))));
  assert.ok(bank.signal.spark_bond.includes(pick("caution", tg({ spark: true, bond: true }))));
  assert.ok(bank.signal.spark.includes(pick("caution", tg({ spark: true }))));
  assert.ok(bank.signal.bond.includes(pick("caution", tg({ bond: true }))));
  // 신호가 하나도 없을 때만 톤 뱅크로 떨어진다.
  for (const tone of PAIR_TONES) assert.ok(bank.signal[tone].includes(pick(tone, tg({}))));
});

test("pair-taste: 결정론 — 같은 (tone,tags,status,date) 는 늘 같은 조합", () => {
  const a = getPairTaste("good", tg({ spark: true, lead: "me" }), "dating", "2026-09-14");
  const b = getPairTaste("good", tg({ spark: true, lead: "me" }), "dating", "2026-09-14");
  assert.deepEqual(a, b);
});

test("pair-taste: 30일 로테이션이 슬롯마다 variant 를 다 쓴다(같은 문장 반복 완화)", () => {
  const seen = { signal: new Set<string>(), relation: new Set<string>(), lead: new Set<string>(), advice: new Set<string>() };
  for (let d = 1; d <= 30; d++) {
    const t = getPairTaste("normal", tg({ spark: true, lead: "me" }), "crush", `2026-09-${String(d).padStart(2, "0")}`);
    seen.signal.add(t.signal); seen.relation.add(t.relation); seen.lead.add(t.lead); seen.advice.add(t.advice);
  }
  for (const [slot, s] of Object.entries(seen)) assert.ok(s.size >= 2, `${slot} 30일간 ${s.size}종`);
});

test("pair-taste: 상대 이름을 문장에 끼우지 않는다(받침 조사 사고 방지)", () => {
  // 🔴 JSON 전체를 stringify 해서 "{" 를 찾으면 **객체 중괄호 때문에 늘 참**이다(그 테스트는
  //    버그를 실행하면서 통과한다). 문장만 꺼내서 본다.
  const bank = pairTasteBank as unknown as Record<string, unknown>;
  const lines: string[] = [];
  for (const [slot, group] of Object.entries(bank)) {
    if (slot === "_note" || typeof group !== "object" || group === null) continue;
    for (const arr of Object.values(group as Record<string, string[]>)) lines.push(...arr);
  }
  assert.equal(lines.length, 36, "슬롯 4개(14+10+6+6)가 다 읽혔는지 — 키가 빠지면 아래 루프가 무의미해진다");
  for (const s of lines) {
    assert.ok(!s.includes("{"), `자리표시자 금지: ${s.slice(0, 20)}…`);
    assert.ok(!s.includes("$"), `템플릿 리터럴 금지: ${s.slice(0, 20)}…`);
  }
});

test("pair-taste: 관계 유형이 다르면 relation 문구도 다르다(옛 getPairStaticLine 계약 계승)", () => {
  // 🔴 삭제한 테스트가 지키던 계약이다("같은 tone 이라도 onesided ≠ dating"). 뱅크를 복붙으로
  //    채우면 짝사랑과 연애가 같은 말을 하게 되는데, 다른 테스트들(비어있지 않음·자수·로테이션)은
  //    그걸 전부 통과시킨다.
  for (const date of ["2026-09-14", "2026-09-15"]) {
    const byStatus = STATUSES.map((s) => getPairTaste("good", tg({}), s, date).relation);
    assert.equal(new Set(byStatus).size, STATUSES.length, `${date}: status 5종이 서로 다른 문구여야 한다`);
  }
});
