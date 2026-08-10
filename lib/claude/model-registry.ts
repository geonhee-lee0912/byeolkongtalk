// lib/claude/model-registry.ts
// model id → provider 매핑 단일 원천. QA 는 QA_CHAT_MODEL 로 전역 오버라이드(한 모델씩 테스트).
export type Provider = "anthropic" | "openai" | "gemini";

const MODEL_PROVIDER: Record<string, Provider> = {
  "claude-sonnet-5": "anthropic",
  "claude-haiku-4-5": "anthropic",
  "gpt-5-mini": "openai",
  "gpt-5-nano": "openai",
  "gpt-5.6-luna": "openai",
  // ⚠️ "gemini-3-flash" 는 실재하지 않는 이름(v1beta 404) — 계정 ListModels 로 확인한 유효 이름만 등록.
  "gemini-3.6-flash": "gemini", // 최신 stable flash (기본 후보)
  "gemini-3-flash-preview": "gemini", // 원 plan 의 "Gemini 3 Flash"(preview 티어)
};

export const DEFAULT_CHAT_MODEL = "claude-sonnet-5";

// chat 지면(고민톡·연애·시뮬) 표준 모델. 미래 프리미엄 티어는 여기서 분기.
// DEFAULT_CHAT_MODEL 은 sonnet 안전폴백으로 유지(model 미배선 호출부 보호).
export const CHAT_MODEL = "gpt-5.6-luna";

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
