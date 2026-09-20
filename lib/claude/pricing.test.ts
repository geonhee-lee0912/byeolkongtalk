import { test } from "node:test";
import assert from "node:assert/strict";
import { costWon, RATES, USD_KRW, type Usage } from "./pricing.ts";

const zero: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

test("sonnet — 손 계산과 일치한다", () => {
  // 입력 1M · 출력 1M · 캐시읽기 1M · 캐시쓰기(1h) 1M
  // = 3 + 15 + 0.3 + 6 = $24.3 → ×1400 = ₩34,020
  const u: Usage = {
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheReadTokens: 1_000_000,
    cacheWriteTokens: 1_000_000,
  };
  assert.equal(costWon("claude-sonnet-5", u), 34_020);
});

test("luna — 실제 규모(입력 8천·출력 1천)에서 반올림이 맞다", () => {
  // 8000/1e6*0.20 + 1000/1e6*1.20 = 0.0016 + 0.0012 = $0.0028 → ×1400 = ₩3.92 → 4
  const u: Usage = { ...zero, inputTokens: 8_000, outputTokens: 1_000 };
  assert.equal(costWon("gpt-5.6-luna", u), 4);
});

test("토큰 0 이면 0원이다 (null 아님)", () => {
  assert.equal(costWon("claude-sonnet-5", zero), 0);
});

test("모르는 모델은 null — 0 으로 위장하지 않는다", () => {
  assert.equal(costWon("gpt-9-imaginary", { ...zero, inputTokens: 1_000_000 }), null);
});

test("단가 미확정 모델도 null 이다", () => {
  // RATES 에 null 로 둔 모델은 '아직 안 채운 것'이라 0 이 아니라 null 이어야 한다.
  const unpriced = Object.entries(RATES).filter(([, r]) => r === null);
  for (const [model] of unpriced) {
    assert.equal(costWon(model, { ...zero, inputTokens: 1_000_000 }), null, `${model} 이 0 을 냈다`);
  }
});

test("환율 상수가 기존 스크립트와 같다", () => {
  // scripts/parse-console-cost.mjs · scripts/tiering-cost-reanchor.mjs 와 같은 값이어야
  // 과거 분석과 대조가 성립한다.
  assert.equal(USD_KRW, 1400);
});

test("가격이 채워진 모델은 4개 요율을 전부 갖는다", () => {
  for (const [model, r] of Object.entries(RATES)) {
    if (r === null) continue;
    for (const k of ["in", "out", "cacheRead", "cacheWrite"] as const) {
      assert.equal(typeof r[k], "number", `${model}.${k} 가 숫자가 아니다`);
      assert.ok(r[k] >= 0, `${model}.${k} 가 음수다`);
    }
  }
});
