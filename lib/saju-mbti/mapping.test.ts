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

test("yinYangRaw — 대칭 상쇄 확인(양간+음간 동일가중이면 표기상 0 근처)", () => {
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
