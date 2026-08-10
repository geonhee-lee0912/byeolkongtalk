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
