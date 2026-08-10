// lib/claude/adapters/gemini.ts
// Gemini(3 Flash 계열) 어댑터 — "1회 순수 스트림"만 담당. 재시도·빈응답 가드·로깅은
// streamChat(lib/claude.ts) 래퍼가 소유(anthropic/openai 어댑터와 동일 계약).
import { GoogleGenAI } from "@google/genai";
import type { ProviderAdapter, AdapterStreamArgs, StopReason } from "./types";

// ⚠️ lazy 초기화(openai 어댑터와 동일 이유). parse.test.ts 는 lib/ 아래라 CI 가 실행하며 이
// 모듈을 import 한다. CI 엔 GEMINI_API_KEY 가 없으므로 모듈 로드 시 클라이언트를 만들지 않는다.
let _client: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  return (_client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));
}

/** Gemini FinishReason(문자열 enum)을 어댑터 계약의 StopReason 으로 정규화. */
export function mapGeminiFinish(r: string | null | undefined): StopReason {
  if (r === "STOP") return "end_turn";
  if (r === "MAX_TOKENS") return "max_tokens";
  if (r === "SAFETY" || r === "PROHIBITED_CONTENT") return "refusal";
  return r == null ? null : "other";
}

export const geminiAdapter: ProviderAdapter = {
  async *stream({ systemStatic, systemDynamic, messages, maxTokens, model }: AdapterStreamArgs) {
    // Gemini 는 system 을 systemInstruction 으로 분리 → 정적+동적을 합쳐 넣는다.
    const system = systemDynamic ? `${systemStatic}\n\n---\n\n${systemDynamic}` : systemStatic;
    // Gemini contents 포맷: assistant→"model", user→"user". parts:[{text}].
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const stream = await client().models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction: system,
        maxOutputTokens: maxTokens,
        thinkingConfig: { thinkingBudget: 0 }, // 0 = DISABLED (thinking off, 별콩이 정책)
      },
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
