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
