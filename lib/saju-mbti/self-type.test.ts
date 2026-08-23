import { test } from "node:test";
import assert from "node:assert/strict";
import { QUESTIONS } from "./questions.ts";
import { POLES } from "./constants.ts";

const AXIS_POLES = new Set(Object.values(POLES).flat());

test("questions — 12문항·축당 3개·각 4선택지", () => {
  assert.equal(QUESTIONS.length, 12);
  const byAxis: Record<string, number> = {};
  for (const q of QUESTIONS) {
    assert.equal(q.options.length, 4, `${q.id} 선택지 4개 아님`);
    byAxis[q.axis] = (byAxis[q.axis] ?? 0) + 1;
  }
  assert.deepEqual(byAxis, { yinYang: 3, strength: 3, wealth: 3, nurture: 3 });
});

test("questions — 선택지 id 유일·가중치 극 유효·주축 +2 존재", () => {
  const ids = new Set<string>();
  for (const q of QUESTIONS) {
    const front = POLES[q.axis][0], back = POLES[q.axis][1];
    let hasPrimary = false;
    for (const o of q.options) {
      assert.ok(!ids.has(o.id), `중복 id ${o.id}`);
      ids.add(o.id);
      for (const [pole, w] of Object.entries(o.weights)) {
        assert.ok(AXIS_POLES.has(pole as never), `${o.id} 무효 극 ${pole}`);
        assert.ok(w === 1 || w === 2, `${o.id} 가중치 1/2 아님`);
      }
      if (o.weights[front] === 2 || o.weights[back] === 2) hasPrimary = true;
    }
    assert.ok(hasPrimary, `${q.id} 주축 +2 없음`);
  }
});
