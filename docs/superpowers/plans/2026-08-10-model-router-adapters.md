# 모델 라우터/어댑터 + QA 검증 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `streamChat`을 프로바이더 무관 어댑터 구조로 리팩터해, 후보 저가 모델(GPT-5 mini/nano·Gemini 3 Flash)이 별콩이 화법을 유지하는지 로컬 QA로 검증할 수 있게 한다.

**Architecture:** `streamChat`의 프로바이더 호출부만 `ProviderAdapter`로 분리(`lib/claude/adapters/*`). 재시도·빈응답 가드·로깅 래퍼는 `streamChat`에 유지. `model-registry`가 model id → 어댑터를 매핑하고 QA용 env 오버라이드를 읽는다. anthropic 어댑터는 현 로직을 **그대로 이관**해 회귀 0. 판정은 별도 pairwise judge(Opus)로 sonnet vs 후보를 블라인드 비교.

**Tech Stack:** Next.js 16 / TypeScript strict / `@anthropic-ai/sdk`(기존) · `openai` · `@google/genai`(신규) / **테스트 = `node:test`** (`node --import tsx --test`, 기존 41개 `*.test.ts` 관례 — ⚠️vitest 미설치, `import { test } from "node:test"` + `node:assert/strict` 사용, `import`는 명시 `.ts` 확장자) / 로컬 dev 서버 + `qa/` 하네스. **아래 Task 5/6/7 코드블록의 `vitest` import·`npx vitest run`은 전부 node:test 로 읽을 것.** CI(`.github/workflows/test.yml`)가 `qa/` 제외한 모든 `*.test.ts`를 자동 발견하니 러너가 안 맞으면 CI 실패.

**정본 spec:** `docs/superpowers/specs/2026-08-10-model-router-qa-design.md`

---

## File Structure

- Create `lib/claude/adapters/types.ts` — `ProviderAdapter` 인터페이스 + `StopReason` 공통 타입.
- Create `lib/claude/model-registry.ts` — model id → provider 매핑 + `resolveChatModel()`(QA env 오버라이드).
- Create `lib/claude/adapters/anthropic.ts` — 현 `anthropic.messages.stream` 로직 이관.
- Create `lib/claude/adapters/openai.ts` — GPT-5 계열.
- Create `lib/claude/adapters/gemini.ts` — Gemini 3 Flash.
- Modify `lib/claude.ts` — `streamChat`이 registry로 어댑터 dispatch(공통 래퍼 유지). 5 라우트 호출부에 `model?` 인자.
- Create `qa/evaluate/pairwise.ts` — Opus pairwise 블라인드 judge.
- Create `qa/compare.ts` — 같은 케이스를 기준선+후보로 돌려 pairwise 판정 산출.
- Modify `qa/config.ts` — `QA_CHAT_MODEL` 오버라이드 + `PAIRWISE_JUDGE_MODEL`.
- Test: `lib/claude/model-registry.test.ts` · `lib/claude/adapters/parse.test.ts` · `qa/evaluate/pairwise.test.ts`.

**⚠️ 어댑터 대상 아님:** `lib/sensitive.ts`(민감 2차 판정, haiku 직접 호출) — 안전 크리티컬, 손대지 않는다.

---

## Task 1: 어댑터 인터페이스 + 공통 타입

**Files:**
- Create: `lib/claude/adapters/types.ts`

- [ ] **Step 1: 인터페이스 작성**

```ts
// lib/claude/adapters/types.ts
// 프로바이더 무관 스트리밍 계약. streamChat 의 재시도·로깅 래퍼가 이 위에 씌워진다.
export type StopReason = "end_turn" | "max_tokens" | "refusal" | "other" | null;

export interface AdapterStreamArgs {
  /** 페르소나 등 정적 블록(프로바이더별 캐시 마킹 대상). */
  systemStatic: string;
  /** turn-specific 동적 블록(캐시 미마킹). 없으면 빈 문자열. */
  systemDynamic: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens: number;
  /** registry 가 고른 구체 model id (예: "gpt-5-mini"). */
  model: string;
}

export interface ProviderAdapter {
  /** 텍스트 조각을 yield, 최종 stop_reason 을 return. 재시도 없음(순수 1회). */
  stream(args: AdapterStreamArgs): AsyncGenerator<string, StopReason>;
  /** 스트림 도중 던져진 에러가 일시적(재호출로 복구 가능)인가. */
  isRetryableError(err: unknown): boolean;
}
```

- [ ] **Step 2: tsc 확인**

Run: `npx tsc --noEmit`
Expected: 통과(타입 선언만).

- [ ] **Step 3: Commit**

```bash
git add lib/claude/adapters/types.ts
git commit -m "feat(model-router): 프로바이더 어댑터 인터페이스"
```

---

## Task 2: model registry (매핑 + QA 오버라이드)

**Files:**
- Create: `lib/claude/model-registry.ts`
- Test: `lib/claude/model-registry.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

```ts
// lib/claude/model-registry.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { providerOf, resolveChatModel } from "./model-registry";

describe("model-registry", () => {
  afterEach(() => { delete process.env.QA_CHAT_MODEL; });

  it("기본은 sonnet-5 (anthropic)", () => {
    expect(resolveChatModel(undefined)).toBe("claude-sonnet-5");
    expect(providerOf("claude-sonnet-5")).toBe("anthropic");
  });
  it("QA_CHAT_MODEL 이 최우선 오버라이드", () => {
    process.env.QA_CHAT_MODEL = "gpt-5-mini";
    expect(resolveChatModel("claude-sonnet-5")).toBe("gpt-5-mini");
  });
  it("provider 매핑", () => {
    expect(providerOf("gpt-5-mini")).toBe("openai");
    expect(providerOf("gpt-5-nano")).toBe("openai");
    expect(providerOf("gemini-3-flash")).toBe("gemini");
  });
  it("미등록 model 은 throw", () => {
    expect(() => providerOf("unknown-x")).toThrow();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run lib/claude/model-registry.test.ts`
Expected: FAIL(모듈 없음).

- [ ] **Step 3: 구현**

```ts
// lib/claude/model-registry.ts
// model id → provider 매핑 단일 원천. QA 는 QA_CHAT_MODEL 로 전역 오버라이드(한 모델씩 테스트).
export type Provider = "anthropic" | "openai" | "gemini";

const MODEL_PROVIDER: Record<string, Provider> = {
  "claude-sonnet-5": "anthropic",
  "claude-haiku-4-5": "anthropic",
  "gpt-5-mini": "openai",
  "gpt-5-nano": "openai",
  "gemini-3-flash": "gemini",
};

export const DEFAULT_CHAT_MODEL = "claude-sonnet-5";

export function providerOf(model: string): Provider {
  const p = MODEL_PROVIDER[model];
  if (!p) throw new Error(`[model-registry] 미등록 model: ${model}`);
  return p;
}

/** 호출부가 넘긴 model(없으면 기본) → QA env 오버라이드가 있으면 그것으로 교체. */
export function resolveChatModel(requested: string | undefined): string {
  const override = process.env.QA_CHAT_MODEL?.trim();
  if (override) return override;
  return requested ?? DEFAULT_CHAT_MODEL;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run lib/claude/model-registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/claude/model-registry.ts lib/claude/model-registry.test.ts
git commit -m "feat(model-router): model→provider registry + QA 오버라이드"
```

---

## Task 3: anthropic 어댑터 이관 (회귀 0)

**Files:**
- Create: `lib/claude/adapters/anthropic.ts`
- Modify: `lib/claude.ts:334-444`(streamChat)

⚠️ **핵심 불변식:** 이관 후 `model` 미지정 시 동작이 현재와 **바이트 동일**해야 한다. 현 `streamChat`의 재시도·빈응답·로깅 래퍼는 **`lib/claude.ts`에 남기고**, 어댑터는 "1회 순수 스트림"만 담당.

- [ ] **Step 1: anthropic 어댑터 작성** (현 `lib/claude.ts:368-392`의 `.stream()` + SSE 파싱을 그대로 옮김)

```ts
// lib/claude/adapters/anthropic.ts
import Anthropic from "@anthropic-ai/sdk";
import { isRetryableUpstreamError } from "@/lib/upstream-error";
import type { ProviderAdapter, AdapterStreamArgs, StopReason } from "./types";

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

function mapStop(r: string | null | undefined): StopReason {
  if (r === "end_turn" || r === "max_tokens" || r === "refusal") return r;
  return r == null ? null : "other";
}

export const anthropicAdapter: ProviderAdapter = {
  async *stream({ systemStatic, systemDynamic, messages, maxTokens, model }: AdapterStreamArgs) {
    // 정적 블록만 cache_control(ttl 1h). dynamicPart 없으면 단일 블록.
    const systemBlocks = systemDynamic
      ? [
          { type: "text" as const, text: systemStatic, cache_control: { type: "ephemeral" as const, ttl: "1h" as const } },
          { type: "text" as const, text: systemDynamic },
        ]
      : [{ type: "text" as const, text: systemStatic }];
    const stream = anthropic.messages.stream({
      model,
      max_tokens: maxTokens,
      thinking: { type: "disabled" }, // Sonnet 5 adaptive thinking 이 max_tokens 잠식 → OFF 유지
      system: systemBlocks,
      messages,
    });
    let stop: StopReason = null;
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      } else if (event.type === "message_delta") {
        stop = mapStop(event.delta.stop_reason) ?? stop;
      }
    }
    return stop;
  },
  isRetryableError: isRetryableUpstreamError,
};
```

- [ ] **Step 2: streamChat 을 어댑터 dispatch 로 리팩터**

`lib/claude.ts`의 `streamChat` 본문에서 프로바이더 호출부(현 368~392의 `anthropic.messages.stream` + for-await)를 어댑터 호출로 교체. 재시도 루프·빈응답 가드·로깅은 유지. systemMessage(string|{staticPart,dynamicPart})를 `systemStatic`/`systemDynamic`로 변환.

```ts
// lib/claude.ts (streamChat 시그니처에 model 추가)
import { anthropicAdapter } from "@/lib/claude/adapters/anthropic";
import { openaiAdapter } from "@/lib/claude/adapters/openai";
import { geminiAdapter } from "@/lib/claude/adapters/gemini";
import { providerOf, resolveChatModel } from "@/lib/claude/model-registry";
import type { ProviderAdapter, StopReason } from "@/lib/claude/adapters/types";

const ADAPTERS: Record<string, ProviderAdapter> = {
  anthropic: anthropicAdapter, openai: openaiAdapter, gemini: geminiAdapter,
};

export async function* streamChat(
  systemMessage: { staticPart: string; dynamicPart: string } | string,
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens: number = 2660,
  logCtx?: LogContext,
  model?: string,
) {
  const resolved = resolveChatModel(model);
  const adapter = ADAPTERS[providerOf(resolved)];
  const systemStatic = typeof systemMessage === "string" ? systemMessage : systemMessage.staticPart;
  const systemDynamic = typeof systemMessage === "string" ? "" : systemMessage.dynamicPart;

  const MAX_ATTEMPTS = 2;
  let lastStopReason: StopReason = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const it = adapter.stream({ systemStatic, systemDynamic, messages, maxTokens, model: resolved });
    let yielded = false;
    let stopReason: StopReason = null;
    try {
      let r = await it.next();
      while (!r.done) { yielded = true; yield r.value; r = await it.next(); }
      stopReason = r.value;
    } catch (err) {
      if (yielded || attempt >= MAX_ATTEMPTS || !adapter.isRetryableError(err)) throw err;
      void logInfo("streamChat transient upstream error — retrying", {
        ...logCtx, extra: { ...logCtx?.extra, attempt, model: resolved, errorType: upstreamErrorType(err) },
      });
      await new Promise((r) => setTimeout(r, 500 * attempt));
      continue;
    }
    if (yielded) return stopReason;
    lastStopReason = stopReason;
    const emptyLogCtx: LogContext = { ...logCtx, extra: { ...logCtx?.extra, attempt, stopReason: stopReason ?? "unknown", model: resolved } };
    if (attempt < MAX_ATTEMPTS) void logInfo("streamChat empty completion — retrying", emptyLogCtx);
    else void logWarn("streamChat empty after all retries", emptyLogCtx);
  }
  return lastStopReason;
}
```

- [ ] **Step 3: tsc + 유닛 회귀**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 통과(기존 유닛 무손상).

- [ ] **Step 4: QA 회귀 (수동, sonnet-5 기본)**

`.env.local`에 `CLAUDE_API_KEY` 있는지 확인. 별도 터미널에서 `npm run dev`, 그다음:
Run: `npx tsx qa/run.ts` (또는 프로젝트의 QA 실행 커맨드 — `package.json` scripts 확인)
Expected: 어댑터 이관 전과 동일한 통과율. `qa/out/`의 최신 summary를 직전 실행과 대조(회귀 0 확인).

- [ ] **Step 5: Commit**

```bash
git add lib/claude/adapters/anthropic.ts lib/claude.ts
git commit -m "refactor(model-router): anthropic 어댑터 분리 + streamChat dispatch (회귀0)"
```

---

## Task 4: 5 라우트 호출부에 model 인자 배선 (기본값 유지)

**Files:**
- Modify: `app/api/consultations/tarot/chat/route.ts` · `.../saju/chat/route.ts` · `app/api/relationship/chat/route.ts` · `app/api/relationship/sim/chat/route.ts` · `app/api/fortune/create/route.ts`

⚠️ 이 태스크는 **인자 통로만** 뚫는다. 상품별 실제 모델 배치는 QA 통과 후. 지금은 전부 `model` 미지정(=sonnet-5)이라 동작 무변경. QA는 Task 6의 env 오버라이드로 전환하므로, 라우트는 인자를 안 넘겨도 QA가 동작한다 — **이 태스크는 선택적**이며, 상품별 배치 단계에서 값을 채운다.

- [ ] **Step 1: 각 라우트의 `streamChat(...)`/`generateOnce(...)` 호출 시그니처가 `model?`를 받을 수 있음을 확인**(추가 인자라 기존 호출 무변경). 지금은 변경 없음 — 통로만 존재 확인.

- [ ] **Step 2: Commit (변경 없으면 skip)**

---

## Task 5: OpenAI 어댑터 (GPT-5 mini/nano)

**Files:**
- Create: `lib/claude/adapters/openai.ts`
- Test: `lib/claude/adapters/parse.test.ts`(스트림 파싱 순수 함수만)

⚠️ **SDK 정확한 메서드·타입은 구현 시 확인**: `npm i openai` 후 `node_modules/openai` 타입 또는 공식 문서. 2026-08 최신 API(responses vs chat.completions·reasoning_effort)는 설치 버전 기준. **아래는 인터페이스 계약과 파싱 로직**이며, SDK 호출부는 컴파일 루프로 맞춘다(추측 금지 — 설치된 SDK 타입 확인).

- [ ] **Step 1: 파싱 순수 함수 실패 테스트** (SSE delta → 텍스트/finish_reason 매핑은 SDK와 분리해 단위 테스트)

```ts
// lib/claude/adapters/parse.test.ts
import { describe, it, expect } from "vitest";
import { mapOpenAIFinish } from "./openai";

describe("openai finish 매핑", () => {
  it("stop→end_turn, length→max_tokens, content_filter→refusal", () => {
    expect(mapOpenAIFinish("stop")).toBe("end_turn");
    expect(mapOpenAIFinish("length")).toBe("max_tokens");
    expect(mapOpenAIFinish("content_filter")).toBe("refusal");
    expect(mapOpenAIFinish(null)).toBe(null);
    expect(mapOpenAIFinish("tool_calls")).toBe("other");
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run lib/claude/adapters/parse.test.ts` → FAIL.

- [ ] **Step 3: 구현** (스트리밍은 OpenAI SDK로. system+dynamic 을 하나의 system 메시지로 합침 — OpenAI 는 cache_control 없이 자동 프리픽스 캐시라 QA 단계엔 무영향)

```ts
// lib/claude/adapters/openai.ts
import OpenAI from "openai";
import type { ProviderAdapter, AdapterStreamArgs, StopReason } from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export function mapOpenAIFinish(r: string | null | undefined): StopReason {
  if (r === "stop") return "end_turn";
  if (r === "length") return "max_tokens";
  if (r === "content_filter") return "refusal";
  return r == null ? null : "other";
}

export const openaiAdapter: ProviderAdapter = {
  async *stream({ systemStatic, systemDynamic, messages, maxTokens, model }: AdapterStreamArgs) {
    const system = systemDynamic ? `${systemStatic}\n\n---\n\n${systemDynamic}` : systemStatic;
    // ⚠️ SDK 호출부는 설치된 openai 버전 타입에 맞춰 컴파일 루프로 확정.
    //    reasoning 계열이면 reasoning_effort:"minimal" 로 thinking 최소화(별콩이는 thinking off 상당).
    const stream = await openai.chat.completions.create({
      model, max_tokens: maxTokens, stream: true,
      messages: [{ role: "system", content: system }, ...messages],
    });
    let stop: StopReason = null;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
      const fr = chunk.choices[0]?.finish_reason;
      if (fr) stop = mapOpenAIFinish(fr);
    }
    return stop;
  },
  isRetryableError(err: unknown) {
    const status = (err as { status?: number })?.status;
    return status === 429 || status === 500 || status === 503 || status === 529;
  },
};
```

- [ ] **Step 4: 파싱 유닛 통과** — `npx vitest run lib/claude/adapters/parse.test.ts` → PASS. `npx tsc --noEmit` 통과(SDK 타입 맞을 때까지 컴파일 루프).

- [ ] **Step 5: 로컬 스모크** — `.env.local`에 `OPENAI_API_KEY` 추가. `npm run dev` 뜬 상태에서:
Run: `QA_CHAT_MODEL=gpt-5-mini npx tsx qa/run.ts` (케이스 1~2개만 — `qa/run.ts`가 필터 지원하면 사용, 아니면 전체 중 첫 결과 확인)
Expected: gpt-5-mini 응답이 `qa/out/`에 정상 텍스트로 생성(빈응답·크래시 없음).

- [ ] **Step 6: Commit**

```bash
git add lib/claude/adapters/openai.ts lib/claude/adapters/parse.test.ts
git commit -m "feat(model-router): OpenAI 어댑터 (GPT-5 mini/nano)"
```

---

## Task 6: Gemini 어댑터 (Gemini 3 Flash)

**Files:**
- Create: `lib/claude/adapters/gemini.ts`

⚠️ SDK = `@google/genai`(2026 현행). 정확한 스트리밍 메서드·chunk shape는 설치 후 타입 확인 + 컴파일 루프. system 은 `systemInstruction`으로, thinking 은 `thinkingConfig.thinkingBudget: 0`로 최소화.

- [ ] **Step 1: finish 매핑 유닛** (`lib/claude/adapters/parse.test.ts`에 추가)

```ts
import { mapGeminiFinish } from "./gemini";
it("gemini finish 매핑", () => {
  expect(mapGeminiFinish("STOP")).toBe("end_turn");
  expect(mapGeminiFinish("MAX_TOKENS")).toBe("max_tokens");
  expect(mapGeminiFinish("SAFETY")).toBe("refusal");
  expect(mapGeminiFinish(undefined)).toBe(null);
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현**

```ts
// lib/claude/adapters/gemini.ts
import { GoogleGenAI } from "@google/genai";
import type { ProviderAdapter, AdapterStreamArgs, StopReason } from "./types";

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export function mapGeminiFinish(r: string | null | undefined): StopReason {
  if (r === "STOP") return "end_turn";
  if (r === "MAX_TOKENS") return "max_tokens";
  if (r === "SAFETY" || r === "PROHIBITED_CONTENT") return "refusal";
  return r == null ? null : "other";
}

export const geminiAdapter: ProviderAdapter = {
  async *stream({ systemStatic, systemDynamic, messages, maxTokens, model }: AdapterStreamArgs) {
    const system = systemDynamic ? `${systemStatic}\n\n---\n\n${systemDynamic}` : systemStatic;
    // ⚠️ contents 는 gemini 포맷({role:"user"|"model", parts:[{text}]}). assistant→model 매핑.
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    // ⚠️ 정확한 스트리밍 호출은 설치된 @google/genai 타입으로 컴파일 루프.
    const stream = await genai.models.generateContentStream({
      model,
      contents,
      config: { systemInstruction: system, maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } },
    });
    let stop: StopReason = null;
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) yield text;
      const fr = chunk.candidates?.[0]?.finishReason;
      if (fr) stop = mapGeminiFinish(fr);
    }
    return stop;
  },
  isRetryableError(err: unknown) {
    const status = (err as { status?: number })?.status;
    return status === 429 || status === 500 || status === 503;
  },
};
```

- [ ] **Step 4: 유닛 + tsc** — PASS + 컴파일 루프.

- [ ] **Step 5: 로컬 스모크** — `.env.local` `GEMINI_API_KEY`. `QA_CHAT_MODEL=gemini-3-flash npx tsx qa/run.ts`(1~2케이스) → 정상 텍스트.

- [ ] **Step 6: Commit**

```bash
git add lib/claude/adapters/gemini.ts lib/claude/adapters/parse.test.ts
git commit -m "feat(model-router): Gemini 어댑터 (Gemini 3 Flash)"
```

---

## Task 7: pairwise 블라인드 judge (Opus) + 비교 실행

**Files:**
- Create: `qa/evaluate/pairwise.ts`
- Create: `qa/compare.ts`
- Modify: `qa/config.ts`(+`PAIRWISE_JUDGE_MODEL: "claude-opus-5"`)
- Test: `qa/evaluate/pairwise.test.ts`(파싱·블라인드 언블라인드 순수 로직)

- [ ] **Step 1: 파싱·언블라인드 실패 테스트**

```ts
// qa/evaluate/pairwise.test.ts
import { describe, it, expect } from "vitest";
import { parsePairwise, unblind } from "./pairwise";

describe("pairwise", () => {
  it("winner A/B 를 원 라벨로 언블라인드 (위치 무작위 대응)", () => {
    // slotA=baseline, slotB=candidate 로 섞였을 때
    expect(unblind("A", { A: "baseline", B: "candidate" })).toBe("baseline");
    expect(unblind("B", { A: "baseline", B: "candidate" })).toBe("candidate");
    expect(unblind("tie", { A: "baseline", B: "candidate" })).toBe("tie");
  });
  it("judge JSON 파싱", () => {
    const r = parsePairwise('{"winner":"A","reason":"더 따뜻함"}');
    expect(r.winner).toBe("A");
    expect(r.reason).toContain("따뜻");
  });
  it("파싱 실패 시 tie + 사유", () => {
    expect(parsePairwise("garbage").winner).toBe("tie");
  });
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: pairwise judge 구현** (측면 라벨 숨김 + 위치 무작위. RUBRIC 은 judge.ts의 화법 원칙 재사용하되 **상대 비교** 프롬프트)

```ts
// qa/evaluate/pairwise.ts
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.ts";

const client = new Anthropic({ apiKey: config.claudeApiKey() });
export type Slot = "baseline" | "candidate";
export type Winner = "A" | "B" | "tie";

export function unblind(w: Winner, map: { A: Slot; B: Slot }): Slot | "tie" {
  return w === "tie" ? "tie" : map[w];
}
export function parsePairwise(raw: string): { winner: Winner; reason: string } {
  const c = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const o = JSON.parse(c) as { winner?: string; reason?: string };
    const w = o.winner === "A" || o.winner === "B" ? o.winner : "tie";
    return { winner: w, reason: String(o.reason ?? "") };
  } catch { return { winner: "tie", reason: "파싱 실패" }; }
}

function prompt(userTurn: string, a: string, b: string): string {
  return [
    "너는 운세 챗봇 '별콩이'의 두 응답을 비교하는 심판이야. 어느 쪽이 별콩이 화법에 더 맞는지만 고른다.",
    "별콩이 화법: 따뜻함+차분함+신비로움, 단정적 예언 금지, 흐름·가능성·선택 3키워드, 답 먼저(회피구 금지), 부정은 완곡+출구, 매턴 질문으로 마무리 금지(2연속 질문 금지).",
    "⚠️ 소신 있는 방향 제시('내가 보기엔 ~')는 위반 아니라 권장. 질문 자체는 위반 아님(2연속 질문 마무리만 위반).",
    "",
    `## 유저 발화\n${userTurn}`,
    `## 응답 A\n${a}`,
    `## 응답 B\n${b}`,
    "",
    '## 출력 — JSON 하나만: {"winner":"A"|"B"|"tie","reason":"한 줄 근거"}',
    "동등하거나 못 고르겠으면 tie.",
  ].join("\n");
}

/** 위치 무작위·라벨 숨김 pairwise. seedIndex 로 슬롯 배치를 결정(재현성 — Math.random 미사용). */
export async function pairwise(
  userTurn: string, baselineText: string, candidateText: string, seedIndex: number,
): Promise<{ winner: Slot | "tie"; reason: string }> {
  const baselineIsA = seedIndex % 2 === 0; // 짝수면 A=baseline
  const map = { A: baselineIsA ? "baseline" : "candidate", B: baselineIsA ? "candidate" : "baseline" } as const;
  const a = baselineIsA ? baselineText : candidateText;
  const b = baselineIsA ? candidateText : baselineText;
  const res = await client.messages.create({
    model: config.PAIRWISE_JUDGE_MODEL,
    max_tokens: 500,
    messages: [{ role: "user", content: prompt(userTurn, a, b) }],
  });
  const text = res.content.filter((x): x is Anthropic.TextBlock => x.type === "text").map((x) => x.text).join("");
  const { winner, reason } = parsePairwise(text);
  return { winner: unblind(winner, map), reason };
}
```

- [ ] **Step 4: config 에 judge 모델 추가**

`qa/config.ts`에 `PAIRWISE_JUDGE_MODEL: "claude-opus-5",` 추가(JUDGE_MODEL 아래).

- [ ] **Step 5: 유닛 통과** — `npx vitest run qa/evaluate/pairwise.test.ts` → PASS.

- [ ] **Step 6: 비교 실행 스크립트** (`qa/compare.ts`) — 기준선 실행 결과와 후보 실행 결과(둘 다 `qa/run.ts`가 `qa/out/<ts>/`에 저장)를 읽어, 케이스·턴별로 pairwise 판정하고 집계표를 출력. 객관 신호(assertions)는 각 실행 summary에 이미 있으니 병기.

```ts
// qa/compare.ts — 사용: npx tsx qa/compare.ts <baseline_out_dir> <candidate_out_dir>
// 두 디렉토리의 대응 케이스 트랜스크립트를 로드 → 턴별 pairwise → 승패 집계 + tie + 후보승률.
// (구현: 각 out 디렉토리의 트랜스크립트 JSON 로드 로직은 qa/report.ts 의 로더 재사용. 
//  턴별 baseline.assistantText vs candidate.assistantText 를 pairwise(userText, ...) 에 넣고,
//  seedIndex = 케이스index*100+턴index 로 위치 무작위. 결과를 candidate 승/패/tie 로 카운트해
//  "후보 승률 X% (n=Y), 객관신호 위반 Z건" 을 stdout + qa/out/compare-<ts>.md 로 저장.)
```

⚠️ `qa/compare.ts`의 트랜스크립트 로더는 `qa/report.ts`의 기존 로더를 재사용한다(중복 구현 금지). `qa/report.ts`를 읽어 export 형태 확인 후 import.

- [ ] **Step 7: 캘리브레이션 (수동 게이트)** — 후보 1종으로 10~20 케이스 pairwise 실행 후, 그 판정 결과를 사람이 육안으로 대조해 일치율 확인. 일치율이 낮으면(judge가 명백히 틀린 승패가 다수) `prompt()` 문구를 보정하고 재실행. 통과 후에야 나머지 케이스를 judge에 위임.

- [ ] **Step 8: Commit**

```bash
git add qa/evaluate/pairwise.ts qa/evaluate/pairwise.test.ts qa/compare.ts qa/config.ts
git commit -m "feat(qa): Opus pairwise 블라인드 judge + 비교 실행"
```

---

## Self-Review

**1. Spec coverage:**
- spec §3(접근 A·어댑터·5차이) → Task 1·2·3·5·6 ✅
- spec §3.4(5 라우트) → Task 4 ✅ (통로만, 배치는 후속)
- spec §4(로컬 QA·env 오버라이드) → Task 2 registry + Task 5/6 스모크 ✅
- spec §5(pairwise·객관신호·캘리브레이션·육안표본) → Task 7 ✅
- spec §7(성공기준: 회귀0) → Task 3 Step 4 ✅
- spec §2 비스코프(캐시·배치·배포·가격/분량·페르소나) → plan에 미포함(의도) ✅

**2. Placeholder scan:** OpenAI/Gemini SDK 호출부에 "설치 버전 타입 확인 + 컴파일 루프" 지시 — 이는 외부 SDK 실시간성 반영(claude-api 스킬 방침과 동일)이지 모호 지시가 아님. 인터페이스·파싱·매핑은 완전 코드. `qa/compare.ts`는 로더 재사용 지시 + 정확한 입출력 명세 — 실행 가능.

**3. Type consistency:** `StopReason`·`ProviderAdapter`·`AdapterStreamArgs`(Task 1) → 전 어댑터 준수. `resolveChatModel`/`providerOf`(Task 2) → streamChat(Task 3) 사용. `Slot`/`Winner`(Task 7) 일관.

**미해결 확인 필요(실행 시)**: `qa/run.ts`의 케이스 필터 지원 여부(Task 5 Step 5) · `package.json` QA 실행 스크립트명 · `qa/report.ts` 로더 export(Task 7 Step 6). 실행자가 첫 태스크 전 `qa/run.ts`·`package.json`·`qa/report.ts`를 읽고 확인.
