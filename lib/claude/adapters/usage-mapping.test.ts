import { test } from "node:test";
import assert from "node:assert/strict";
import { mapAnthropicUsage } from "./anthropic.ts";
import { mapOpenAIUsage } from "./openai.ts";
import { mapGeminiUsage } from "./gemini.ts";

// 🔴 이 파일이 지키는 것: **프로바이더마다 입력 토큰 회계가 다르다.**
//    같은 Usage 타입에 담기지만 계산이 다르고, 복사하면 틀린다.
//    2026-09-20 통합 리뷰가 이 클래스로 버그 2건을 찾았는데 tsc·build·유닛 727개가
//    전부 통과했다 — 자동 게이트가 못 잡는 종류라 여기서 명시적으로 잠근다.

test("anthropic — input_tokens 는 캐시 제외 잔여라 빼지 않는다", () => {
  // SDK JSDoc: 총 입력 = input_tokens + cache_creation + cache_read (셋이 배타적)
  assert.deepEqual(
    mapAnthropicUsage({
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 9000,
      cache_creation_input_tokens: 200,
    }),
    { inputTokens: 100, outputTokens: 50, cacheReadTokens: 9000, cacheWriteTokens: 200 }
  );
});

test("anthropic — 캐시 필드가 null 이면 0", () => {
  assert.deepEqual(
    mapAnthropicUsage({ input_tokens: 10, output_tokens: 5, cache_read_input_tokens: null, cache_creation_input_tokens: null }),
    { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 }
  );
});

test("openai — prompt_tokens 에서 cached 와 cache_write 를 **둘 다** 뺀다", () => {
  // 공식 문서: ordinary = prompt_tokens - cached_tokens - cache_write_tokens
  // cached 만 빼면 캐시쓰기분이 입력 요율로 계상돼 참 비용의 20% 가 증발한다.
  assert.deepEqual(
    mapOpenAIUsage({
      prompt_tokens: 10_000,
      completion_tokens: 300,
      prompt_tokens_details: { cached_tokens: 8_000, cache_write_tokens: 1_500 },
    }),
    { inputTokens: 500, outputTokens: 300, cacheReadTokens: 8_000, cacheWriteTokens: 1_500 }
  );
});

test("openai — cache_write 가 없는 모델(nano)은 0 이고 입력이 안 깎인다", () => {
  assert.deepEqual(
    mapOpenAIUsage({
      prompt_tokens: 5_000,
      completion_tokens: 100,
      prompt_tokens_details: { cached_tokens: 4_000 },
    }),
    { inputTokens: 1_000, outputTokens: 100, cacheReadTokens: 4_000, cacheWriteTokens: 0 }
  );
});

test("openai — details 자체가 없으면 전부 ordinary 로 본다", () => {
  assert.deepEqual(
    mapOpenAIUsage({ prompt_tokens: 700, completion_tokens: 80 }),
    { inputTokens: 700, outputTokens: 80, cacheReadTokens: 0, cacheWriteTokens: 0 }
  );
});

test("openai — 합이 어긋나도 음수를 내보내지 않는다", () => {
  const r = mapOpenAIUsage({
    prompt_tokens: 100,
    completion_tokens: 10,
    prompt_tokens_details: { cached_tokens: 500 },
  });
  assert.equal(r.inputTokens, 0);
});

test("gemini — promptTokenCount 는 캐시분을 포함하므로 뺀다", () => {
  assert.deepEqual(
    mapGeminiUsage({ promptTokenCount: 10_000, candidatesTokenCount: 200, cachedContentTokenCount: 9_000 }),
    { inputTokens: 1_000, outputTokens: 200, cacheReadTokens: 9_000, cacheWriteTokens: 0 }
  );
});

test("gemini — thoughts 는 candidatesTokenCount 에 안 들어가므로 출력에 더한다", () => {
  // 이 어댑터는 thinking 을 켜므로(3.x 는 못 끔) thoughts > 0 이 보장된다.
  assert.deepEqual(
    mapGeminiUsage({ promptTokenCount: 500, candidatesTokenCount: 200, thoughtsTokenCount: 120 }),
    { inputTokens: 500, outputTokens: 320, cacheReadTokens: 0, cacheWriteTokens: 0 }
  );
});

test("세 프로바이더가 같은 입력에 서로 다른 답을 낸다 (회계가 다르다는 사실 자체를 잠근다)", () => {
  // 같은 숫자를 넣어도 anthropic 만 빼지 않는다. 이 단정이 깨지면 누군가 복사한 것이다.
  const a = mapAnthropicUsage({ input_tokens: 1_000, output_tokens: 0, cache_read_input_tokens: 900 });
  const o = mapOpenAIUsage({ prompt_tokens: 1_000, completion_tokens: 0, prompt_tokens_details: { cached_tokens: 900 } });
  const g = mapGeminiUsage({ promptTokenCount: 1_000, candidatesTokenCount: 0, cachedContentTokenCount: 900 });
  assert.equal(a.inputTokens, 1_000, "anthropic 은 빼면 안 된다");
  assert.equal(o.inputTokens, 100, "openai 는 빼야 한다");
  assert.equal(g.inputTokens, 100, "gemini 는 빼야 한다");
});
