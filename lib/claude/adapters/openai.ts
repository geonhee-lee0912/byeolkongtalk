// lib/claude/adapters/openai.ts
// OpenAI(GPT-5 계열) 어댑터 — "1회 순수 스트림"만 담당. 재시도·빈응답 가드·로깅은
// streamChat(lib/claude.ts) 래퍼가 소유한다(anthropic 어댑터와 동일 계약).
import OpenAI from "openai";
import type { ProviderAdapter, AdapterStreamArgs, StopReason } from "./types";

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

export const openaiAdapter: ProviderAdapter = {
  async *stream({ systemStatic, systemDynamic, messages, maxTokens, model }: AdapterStreamArgs) {
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
