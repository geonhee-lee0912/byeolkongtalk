// lib/claude/adapters/openai.ts
// OpenAI(GPT-5 계열) 어댑터 — "1회 순수 스트림"만 담당. 재시도·빈응답 가드·로깅은
// streamChat(lib/claude.ts) 래퍼가 소유한다(anthropic 어댑터와 동일 계약).
import OpenAI from "openai";
import type { ProviderAdapter, AdapterStreamArgs, StopReason } from "./types";
import type { Usage } from "@/lib/claude/pricing";

// ⚠️ lazy 초기화. parse.test.ts 는 lib/ 아래라 CI(node --import tsx --test)가 실행하고 이 모듈을
// import 한다. CI 엔 OPENAI_API_KEY 가 없어 모듈 로드 시 new OpenAI() 를 만들면 SDK 가 즉시 throw
// → CI red. 클라이언트는 stream() 이 실제 불릴 때(로컬 스모크/런타임, 키 존재)만 생성한다.
// (anthropic 어댑터는 CI 테스트가 import 하지 않아 모듈 최상단 생성이 안전했다 — 여긴 다르다.)
let _client: OpenAI | null = null;
function client(): OpenAI {
  return (_client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));
}

/** chat.completions 의 finish_reason 을 어댑터 계약의 StopReason 으로 정규화. */
export function mapOpenAIFinish(r: string | null | undefined): StopReason {
  if (r === "stop") return "end_turn";
  if (r === "length") return "max_tokens";
  if (r === "content_filter") return "refusal";
  return r == null ? null : "other";
}

/**
 * chat.completions 청크의 usage → 어댑터 계약.
 * 🔴 prompt_tokens = ordinary + cached + cache_write (공식 문서 예제가 셋을 다 뺀다).
 *    둘 다 빼야 ordinary 만 남는다 — cached 만 빼면 캐시쓰기분이 입력 요율(1.0×)로
 *    계상돼 참 비용의 20% 가 조용히 증발한다.
 *    ⚠️ anthropic 은 반대다 — input_tokens 가 이미 캐시 제외 잔여라 빼면 안 된다.
 *       프로바이더마다 회계가 달라 복사하면 틀린다.
 */
export function mapOpenAIUsage(u: {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  prompt_tokens_details?: { cached_tokens?: number | null; cache_write_tokens?: number | null } | null;
}): Usage {
  const d = u.prompt_tokens_details;
  const cached = d?.cached_tokens ?? 0;
  // gpt-5.6 계열은 캐시 **쓰기**도 청구한다(1.25×). nano 는 청구가 없어 필드가 비고 → 0.
  const written = d?.cache_write_tokens ?? 0;
  return {
    inputTokens: Math.max(0, (u.prompt_tokens ?? 0) - cached - written),
    outputTokens: u.completion_tokens ?? 0,
    cacheReadTokens: cached,
    cacheWriteTokens: written,
  };
}

/**
 * responseFormat → OpenAI create 파라미터 조각. 없으면 {} (response_format 미주입 = 기존 동작).
 * ⚠️ schema 는 openai SDK 의 ResponseFormatJSONSchema.json_schema.schema 가
 * `{ [key: string]: unknown }`(인덱스 시그니처)로 선언돼 있어, 파라미터의 `object` 타입을
 * (프레시 리터럴이 아닌 참조로) 그대로 흘리면 create() 스프레드 지점에서 할당 불가 에러가 난다.
 * 리턴 타입만 Record<string, unknown> 으로 맞추고 여기서 한 번만 캐스팅.
 */
export function openaiResponseFormat(
  rf: { name: string; schema: object } | undefined
): {
  response_format?: {
    type: "json_schema";
    json_schema: { name: string; strict: true; schema: Record<string, unknown> };
  };
} {
  if (!rf) return {};
  return {
    response_format: {
      type: "json_schema",
      json_schema: { name: rf.name, strict: true, schema: rf.schema as Record<string, unknown> },
    },
  };
}

export const openaiAdapter: ProviderAdapter = {
  async *stream({
    systemStatic,
    systemDynamic,
    messages,
    maxTokens,
    model,
    responseFormat,
  }: AdapterStreamArgs) {
    // OpenAI 는 anthropic 식 cache_control 마킹이 없다(자동 프리픽스 캐시) → 정적+동적 블록을
    // 하나의 system 메시지로 합친다. QA 단계엔 캐시 정책 무영향.
    const system = systemDynamic ? `${systemStatic}\n\n---\n\n${systemDynamic}` : systemStatic;
    const stream = await client().chat.completions.create({
      model,
      // ⚠️ GPT-5(o-series 계열)는 max_tokens(deprecated)를 미지원 → max_completion_tokens 사용.
      // openai@7.4 타입 확인: max_tokens 는 "not compatible with o-series models" 로 명시됨.
      max_completion_tokens: maxTokens,
      // 별콩이는 thinking OFF 상당 → reasoning 최소화(anthropic 어댑터의 thinking:disabled 와 대응).
      // ⚠️ 값은 모델별로 다르다(계정 실호출 확인): gpt-5-mini/nano 는 "minimal"·"low" 만, gpt-5.6-luna
      //   는 "none"·"low" 만 지원("minimal"→400). 셋 다 되는 유일한 값이 "low" 라 이걸 쓴다.
      reasoning_effort: "low",
      stream: true,
      // usage 는 이 옵션을 켜야 **마지막 청크**에 실려 온다(기본은 안 준다).
      stream_options: { include_usage: true },
      messages: [{ role: "system", content: system }, ...messages],
      ...openaiResponseFormat(responseFormat),
    });
    let stop: StopReason = null;
    let usage: Usage | null = null;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
      const fr = chunk.choices[0]?.finish_reason;
      if (fr) stop = mapOpenAIFinish(fr);
      // usage 청크는 choices 가 빈 배열이다 — 위 옵셔널 체이닝이 이미 안전하게 넘긴다.
      if (chunk.usage) {
        usage = mapOpenAIUsage(chunk.usage);
      }
    }
    return { stop, usage };
  },
  isRetryableError(err: unknown) {
    const status = (err as { status?: number })?.status;
    return status === 429 || status === 500 || status === 503 || status === 529;
  },
};
