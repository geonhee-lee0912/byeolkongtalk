import { test } from "node:test";
import assert from "node:assert/strict";
import { JANGAN_BONGI, STEM_ORDER, BRANCH_ORDER, ELEMENT_YINYANG, POSITION_WEIGHT } from "./constants.ts";
import { STEM_ELEMENT } from "@/lib/saju/pairing";

test("constants — 지장간 본기 12지지 전부·유효 천간", () => {
  assert.equal(Object.keys(JANGAN_BONGI).length, 12);
  for (const [branch, stem] of Object.entries(JANGAN_BONGI)) {
    assert.ok(BRANCH_ORDER.includes(branch), `${branch} 미등록 지지`);
    assert.ok(STEM_ORDER.includes(stem), `${stem} 미등록 천간`);
    assert.ok(STEM_ELEMENT[stem], `${stem} 오행 없음`);
  }
  assert.equal(JANGAN_BONGI["자"], "계");
  assert.equal(JANGAN_BONGI["인"], "갑");
});

test("constants — 오행 음양(목화 양·금수 음·토 중립)", () => {
  assert.equal(ELEMENT_YINYANG["목"], 1);
  assert.equal(ELEMENT_YINYANG["화"], 1);
  assert.equal(ELEMENT_YINYANG["토"], 0);
  assert.equal(ELEMENT_YINYANG["금"], -1);
  assert.equal(ELEMENT_YINYANG["수"], -1);
});

test("constants — 위치 가중치(월지 3.0·일간 0)", () => {
  assert.equal(POSITION_WEIGHT.monthBranch, 3.0);
  assert.equal(POSITION_WEIGHT.dayStem, 0);
  assert.equal(POSITION_WEIGHT.dayBranch, 1.5);
});

import { activeChars, stemOf, elementOf } from "./mapping.ts";
import { mkSaju } from "./test-utils.ts";

test("activeChars — 일간 제외 7글자(시간 앎) / 5글자(시간 모름)", () => {
  const s = mkSaju({ year: ["갑", "자"], month: ["병", "인"], day: ["무", "오"], hour: ["경", "신"] });
  const known = activeChars(s);
  assert.equal(known.length, 7);
  assert.ok(!known.some((c) => c.char === "무" && c.isStem));
  const unknown = activeChars(mkSaju(
    { year: ["갑", "자"], month: ["병", "인"], day: ["무", "오"], hour: ["경", "신"] },
    { hourKnown: false }
  ));
  assert.equal(unknown.length, 5);
});

test("stemOf — 천간 그대로 / 지지는 본기", () => {
  assert.equal(stemOf({ char: "갑", isStem: true, weight: 1 }), "갑");
  assert.equal(stemOf({ char: "인", isStem: false, weight: 1 }), "갑");
});

test("elementOf — 본기 오행", () => {
  assert.equal(elementOf({ char: "자", isStem: false, weight: 1 }), "수");
  assert.equal(elementOf({ char: "병", isStem: true, weight: 1 }), "화");
});

import { yinYangRaw } from "./mapping.ts";

test("yinYangRaw — 전부 양(갑·인 계열)이면 양(+)", () => {
  const s = mkSaju({ year: ["갑", "인"], month: ["갑", "인"], day: ["무", "오"], hour: ["갑", "인"] });
  assert.ok(yinYangRaw(s) > 0);
});

test("yinYangRaw — 갑(양간+목) 우세는 축(음지·토중립)이 섞여도 뚜렷한 양(+) (근사 0 아님)", () => {
  // 축은 표기상 음(-0.7 기여)이나 오행(토)은 중립(0)이라 상쇄력이 약함 — 갑의 표기상+오행기질 이중 양(+) 기여를 못 이긴다(실값 1.2)
  const s = mkSaju({ year: ["갑", "축"], month: ["갑", "축"], day: ["무", "오"], hour: ["갑", "축"] });
  const raw = yinYangRaw(s);
  assert.ok(raw > 0);
});

test("yinYangRaw — 시간 모름이면 시주 미반영(값이 달라짐)", () => {
  const p = { year: ["갑", "자"], month: ["병", "인"], day: ["무", "오"], hour: ["임", "해"] } as const;
  assert.notEqual(yinYangRaw(mkSaju(p)), yinYangRaw(mkSaju(p, { hourKnown: false })));
});

import { strengthRaw } from "./mapping.ts";

test("strengthRaw — 월지·일지가 일간을 도우면 득령+득지(≥60)", () => {
  const s = mkSaju({ year: ["경", "신"], month: ["병", "인"], day: ["갑", "자"], hour: ["경", "신"] });
  assert.ok(strengthRaw(s) >= 60);
});

test("strengthRaw — 온통 극·설기면 신약(낮음)", () => {
  const s = mkSaju({ year: ["경", "신"], month: ["경", "신"], day: ["갑", "오"], hour: ["병", "오"] });
  assert.ok(strengthRaw(s) < 40);
});

test("strengthRaw — 0~100 범위", () => {
  const s = mkSaju({ year: ["갑", "인"], month: ["갑", "인"], day: ["갑", "인"], hour: ["갑", "인"] });
  const r = strengthRaw(s);
  assert.ok(r >= 0 && r <= 100);
});

test("strengthRaw — 득세는 위치 기준(년지가 월지와 같은 글자여도 포함)", () => {
  // 일간 갑목. 월지 자(수·득령), 월간 경(금·비지지). 년지 자(A, 월지와 동일 글자) vs 해(B, 다른 글자·같은 오행 수) — 위치만 다르므로 결과 동일해야 함.
  // (월간을 갑 대신 경/금 으로, 시지를 오 대신 인/목 으로 둔 이유: 득세 풀이 전부 "돕는" 오행뿐이면 글자값 필터로 일부가
  //  잘못 빠져도 지지율이 우연히 1.0 으로 유지돼 버그가 안 드러난다 — 돕지 않는 오행(금)을 섞어야 배제 여부가 비율에 실제로 반영됨)
  const A = mkSaju({ year: ["갑", "자"], month: ["경", "자"], day: ["갑", "오"], hour: ["갑", "인"] });
  const B = mkSaju({ year: ["갑", "해"], month: ["경", "자"], day: ["갑", "오"], hour: ["갑", "인"] });
  assert.equal(strengthRaw(A), strengthRaw(B));
});

import { wealthRaw } from "./mapping.ts";

test("wealthRaw — 재성·관성 우세면 재(+)", () => {
  const s = mkSaju({ year: ["무", "술"], month: ["경", "신"], day: ["갑", "진"], hour: ["기", "축"] });
  assert.ok(wealthRaw(s) > 0);
});

test("wealthRaw — 인성·식상 우세면 인(-)", () => {
  const s = mkSaju({ year: ["임", "자"], month: ["병", "오"], day: ["갑", "해"], hour: ["정", "사"] });
  assert.ok(wealthRaw(s) < 0);
});

test("wealthRaw — 비겁은 제외(재도 인도 아님)", () => {
  const s = mkSaju({ year: ["갑", "인"], month: ["을", "묘"], day: ["갑", "인"], hour: ["을", "묘"] });
  assert.equal(wealthRaw(s), 0);
});

import { nurtureRaw } from "./mapping.ts";

test("nurtureRaw — 상생 분위기면 생(+)", () => {
  const s = mkSaju({ year: ["갑", "오"], month: ["병", "진"], day: ["무", "신"], hour: ["경", "자"] });
  assert.ok(nurtureRaw(s) > 0);
});

test("nurtureRaw — 상극 분위기면 단(-)", () => {
  const s = mkSaju({ year: ["갑", "진"], month: ["무", "자"], day: ["임", "오"], hour: ["병", "신"] });
  assert.ok(nurtureRaw(s) < 0);
});

test("nurtureRaw — 시간 모름이면 시주 쌍 제외(값 달라짐)", () => {
  const p = { year: ["갑", "오"], month: ["병", "진"], day: ["무", "신"], hour: ["경", "자"] } as const;
  assert.notEqual(nurtureRaw(mkSaju(p)), nurtureRaw(mkSaju(p, { hourKnown: false })));
});

import { elementDistribution, dominantElement } from "./mapping.ts";

test("elementDistribution — 일간 오행이 다른 글자에 없어도 일간 가중(1.5)으로 포함", () => {
  // 활성 글자(일간 제외)에 목이 하나도 없음 → dist[목] 은 오직 일간 갑목 가중(1.5)에서만 나옴
  const s = mkSaju({ year: ["경", "신"], month: ["경", "신"], day: ["갑", "오"], hour: ["경", "신"] });
  const dist = elementDistribution(s);
  assert.equal(dist["목"], 1.5); // 일간 미포함이면 0 이 됨
  assert.ok(dist["금"] > 0);
});

test("dominantElement — 최다 오행(단독)", () => {
  const s = mkSaju({ year: ["갑", "인"], month: ["경", "신"], day: ["무", "오"], hour: ["임", "자"] });
  assert.equal(dominantElement(s), "금");
});

test("dominantElement — 실제 동점(목=수=3.0)일 때 월지 오행으로 tiebreak", () => {
  // 월지 자(수) vs 일간+일지 목 진영을 정확히 3.0 으로 맞춘 픽스처. 토 2.0·금 1.2 는 그보다 낮아 3자 동점은 아님.
  // tiebreak 조항이 없다면 ELEMENT_KEYS 순회상 먼저 오는 "목"이 그대로 최종값이 되므로, 이 케이스는 tiebreak 분기를 실제로 태운다.
  const s = mkSaju(
    { year: ["무", "술"], month: ["경", "자"], day: ["갑", "인"], hour: ["병", "인"] },
    { hourKnown: false }
  );
  const dist = elementDistribution(s);
  assert.equal(dist["목"], dist["수"]); // 실제 동점인지 자체 검증
  assert.equal(dominantElement(s), "수"); // 월지(자→수) 우선
});

import { axisPercentile } from "./mapping.ts";

test("axisPercentile — 분위 배열 선형보간(0~100·단조)", () => {
  const q = Array.from({ length: 21 }, (_, i) => i * 10); // P0..P100 = 0,10,...,200
  assert.equal(axisPercentile(-5, q), 0);
  assert.equal(axisPercentile(205, q), 100);
  assert.equal(axisPercentile(100, q), 50);
  assert.ok(axisPercentile(150, q) > axisPercentile(50, q));
});

import { QUANTILE_TABLE } from "./constants.ts";

test("QUANTILE_TABLE — 4축·21점·오름차순", () => {
  for (const k of ["yinYang", "strength", "wealth", "nurture"] as const) {
    const q = QUANTILE_TABLE[k];
    assert.equal(q.length, 21, `${k} 분위점 21개 아님`);
    for (let i = 1; i < q.length; i++) assert.ok(q[i] >= q[i - 1], `${k} 비단조`);
  }
});

import { paljaType } from "./mapping.ts";

test("paljaType — 코드 4글자·축 순서(음양·강유·재인·생단)", () => {
  const s = mkSaju({ year: ["임", "신"], month: ["기", "유"], day: ["신", "묘"], hour: ["을", "미"] });
  const t = paljaType(s);
  assert.equal(t.code.length, 4);
  assert.ok(["양", "음"].includes(t.axes.yinYang.pole));
  assert.ok(["강", "유"].includes(t.axes.strength.pole));
  assert.ok(["재", "인"].includes(t.axes.wealth.pole));
  assert.ok(["생", "단"].includes(t.axes.nurture.pole));
  assert.equal(
    t.code,
    t.axes.yinYang.pole + t.axes.strength.pole + t.axes.wealth.pole + t.axes.nurture.pole
  );
});

test("paljaType — pct 0~100·pole 은 pct≥50 기준", () => {
  const s = mkSaju({ year: ["임", "신"], month: ["기", "유"], day: ["신", "묘"], hour: ["을", "미"] });
  const t = paljaType(s);
  for (const key of ["yinYang", "strength", "wealth", "nurture"] as const) {
    const a = t.axes[key];
    assert.ok(a.pct >= 0 && a.pct <= 100);
  }
  assert.equal(t.axes.yinYang.pole === "양", t.axes.yinYang.pct >= 50);
});

test("paljaType — element·elementDist·raw 양념 포함", () => {
  const s = mkSaju({ year: ["임", "신"], month: ["기", "유"], day: ["신", "묘"], hour: ["을", "미"] });
  const t = paljaType(s);
  assert.ok(["목", "화", "토", "금", "수"].includes(t.element));
  assert.equal(Object.values(t.elementDist).reduce((a, b) => a + b, 0) > 0, true);
  assert.ok(Array.isArray(t.tenGods));
});
