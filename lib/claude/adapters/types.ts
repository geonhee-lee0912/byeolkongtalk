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
