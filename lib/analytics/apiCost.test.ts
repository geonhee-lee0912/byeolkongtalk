import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreReading, allocate, type Turn } from "./apiCost.ts";

function turns(n: number): Turn[] {
  return Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    chars: 300,
  }));
}

const base = { systemChars: 20_000, cacheHitRate: 0.6 };

test("full_history — 턴이 늘면 점수가 초선형으로 증가", () => {
  const a = scoreReading({ ...base, turns: turns(6), track: "full_history" });
  const b = scoreReading({ ...base, turns: turns(18), track: "full_history" });
  // 턴 3배인데 히스토리 누적 때문에 3배보다 훨씬 커야 한다
  assert.ok(b.score > a.score * 3, `초선형 아님: ${a.score} → ${b.score}`);
});

test("windowed — 창 상한 때문에 점수가 턴 수에 거의 선형", () => {
  const a = scoreReading({ ...base, turns: turns(30), track: "windowed", windowMsgs: 24, summaryChars: 1000 });
  const b = scoreReading({ ...base, turns: turns(60), track: "windowed", windowMsgs: 24, summaryChars: 1000 });
  assert.ok(b.score < a.score * 2.3, `선형 수렴 아님: ${a.score} → ${b.score}`);
  assert.ok(b.score > a.score * 1.7, `너무 평평함: ${a.score} → ${b.score}`);
});

test("캐시 히트율이 높으면 총 점수가 낮다", () => {
  const cold = scoreReading({ ...base, cacheHitRate: 0, turns: turns(10), track: "full_history" });
  const warm = scoreReading({ ...base, cacheHitRate: 0.9, turns: turns(10), track: "full_history" });
  assert.ok(warm.score < cold.score, `캐시 효과 없음: ${cold.score} vs ${warm.score}`);
});

test("출력 토큰이 입력보다 5배 비싸게 반영된다", () => {
  const longOut = scoreReading({
    ...base, systemChars: 0, track: "full_history",
    turns: [{ role: "user", chars: 100 }, { role: "assistant", chars: 1000 }],
  });
  const longIn = scoreReading({
    ...base, systemChars: 0, track: "full_history",
    turns: [{ role: "user", chars: 1000 }, { role: "assistant", chars: 100 }],
  });
  assert.ok(longOut.score > longIn.score, "출력 가중이 반영되지 않음");
});

test("allocate — 배분 총합이 콘솔 총액과 일치", () => {
  const rows = [
    { id: "a", score: 3 },
    { id: "b", score: 1 },
    { id: "c", score: 0 },
  ];
  const out = allocate(rows, 100);
  const sum = out.reduce((acc, r) => acc + r.usd, 0);
  assert.ok(Math.abs(sum - 100) < 1e-9, `총합 불일치: ${sum}`);
  assert.ok(Math.abs(out[0].usd - 75) < 1e-9, `비중 오류: ${out[0].usd}`);
  assert.equal(out[2].usd, 0);
});

test("allocate — 점수 총합 0이면 전부 0 (0으로 나누지 않음)", () => {
  const out = allocate([{ id: "a", score: 0 }], 50);
  assert.equal(out[0].usd, 0);
});

test("빈 대화는 점수 0", () => {
  assert.equal(scoreReading({ ...base, turns: [], track: "full_history" }).score, 0);
});
