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

import { selfType } from "./self-type.ts";

// 헬퍼: 각 문항 답을 지정(미지정 문항은 첫 선택지)
function answer(map: Record<string, string>): Record<string, string> {
  const full: Record<string, string> = {};
  for (const q of QUESTIONS) full[q.id] = map[q.id] ?? q.options[0].id;
  return full;
}

test("selfType — 전부 앞극 첫 선택지면 코드 양강재생", () => {
  // q1a양 q4a강 q7a재 q10a생 … 각 축 주축 앞극
  const t = selfType(answer({}));
  assert.equal(t.axes.yinYang.pole, "양");
  assert.equal(t.axes.strength.pole, "강");
  assert.equal(t.axes.wealth.pole, "재");
  assert.equal(t.axes.nurture.pole, "생");
  assert.equal(t.code, "양강재생");
});

test("selfType — 음 선택지로 몰면 음극", () => {
  const t = selfType(answer({ q1: "q1c", q2: "q2d", q3: "q3c" }));
  assert.equal(t.axes.yinYang.pole, "음");
});

test("selfType — pct 는 원점수 비율(표시용)·raw 는 front−back", () => {
  const t = selfType(answer({})); // 음양 3문항 모두 양+2 = front 6, back 0
  assert.equal(t.axes.yinYang.pct, 100);
  assert.ok(t.axes.yinYang.raw > 0);
});

test("selfType — 전체점 동점(양4=음4)이면 주축 다수결로 폴백", () => {
  // q1a양+2 q2a양+2 (양 4) / q3c음+2 + q8d음+1 + q10b음+1 (음 4) → f==b 동점.
  // 주축 다수결: q1a양·q2a양·q3c음 = 양2 음1 → 양.
  const t = selfType(answer({ q1: "q1a", q2: "q2a", q3: "q3c", q8: "q8d", q10: "q10b" }));
  assert.equal(t.axes.yinYang.raw, 0); // f==b 실제 동점
  assert.equal(t.axes.yinYang.pole, "양"); // 주축 다수결(양2 음1)
});
