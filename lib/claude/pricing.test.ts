import { test } from "node:test";
import assert from "node:assert/strict";
import { costWon, RATES, USD_KRW, type Usage } from "./pricing.ts";
import { providerOf } from "./model-registry.ts";

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
  assert.deepEqual(costWon("claude-sonnet-5", u), { status: "ok", won: 34_020 });
});

test("luna — 실제 규모(입력 8천·출력 1천)에서 4자리까지 낸다", () => {
  // 8000/1e6*0.20 + 1000/1e6*1.20 = 0.0028 → ×1400 = ₩3.92
  const u: Usage = { ...zero, inputTokens: 8_000, outputTokens: 1_000 };
  assert.deepEqual(costWon("gpt-5.6-luna", u), { status: "ok", won: 3.92 });
});

test("🔴 캐시 히트 짧은 턴이 0 으로 사라지지 않는다", () => {
  // 이 서비스에서 가장 흔한 호출이다(luna 캐시 히트 99.6%).
  // 정수 반올림이면 ₩0.4616 → 0 이 되어 원가가 통째로 증발했다.
  const u: Usage = { inputTokens: 170, outputTokens: 80, cacheReadTokens: 9_986, cacheWriteTokens: 0 };
  const r = costWon("gpt-5.6-luna", u);
  assert.equal(r.status, "ok");
  assert.ok(r.status === "ok" && r.won > 0, `0 으로 절삭됐다: ${JSON.stringify(r)}`);
  assert.deepEqual(r, { status: "ok", won: 0.4616 });
});

test("토큰 0 이면 0원이다 (unpriced 아님)", () => {
  assert.deepEqual(costWon("claude-sonnet-5", zero), { status: "ok", won: 0 });
});

test("모르는 모델은 unregistered — 0 으로 위장하지 않는다", () => {
  assert.deepEqual(costWon("gpt-9-imaginary", { ...zero, inputTokens: 1_000_000 }), {
    status: "unregistered",
  });
});

test("프로토타입 체인의 이름을 모델로 오인하지 않는다", () => {
  for (const fake of ["__proto__", "constructor", "toString"]) {
    assert.deepEqual(costWon(fake, zero), { status: "unregistered" }, `${fake} 가 통과했다`);
  }
});

test("단가 미확정 모델은 unpriced — unregistered 와 구분된다", () => {
  const unpriced = Object.entries(RATES).filter(([, r]) => r === null);
  assert.ok(unpriced.length > 0, "단가 미확정 모델이 하나도 없다 — 테스트 전제가 깨졌다");
  for (const [model] of unpriced) {
    assert.deepEqual(
      costWon(model, { ...zero, inputTokens: 1_000_000 }),
      { status: "unpriced" },
      `${model}`
    );
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

test("RATES 의 모든 키가 model-registry 에도 등록돼 있다 (교차 drift 방지)", () => {
  for (const model of Object.keys(RATES)) {
    assert.doesNotThrow(() => providerOf(model), `${model} 이 MODEL_PROVIDER 에 없다`);
  }
});
