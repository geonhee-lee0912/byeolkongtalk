// lib/claude/pricing.ts — 모델별 단가와 원가 계산. **순수**(DB·env 의존 0).
//
// 단가 출처는 이 리포의 기존 분석 스크립트다 — 추측값이 아니다.
//   Anthropic: scripts/parse-console-cost.mjs (콘솔 CSV 실측 단가)
//   OpenAI:    scripts/tiering-cost-reanchor.mjs (PRICE_IN/PRICE_OUT · WRITE_MULT · READ_MULT)
//   환율:      두 스크립트 모두 USD_KRW = 1400
//
// 🔴 단가를 모르는 모델은 **null** 로 둔다. 0 으로 채우면 "공짜"와 구별이 안 되고,
//    합계가 조용히 과소 계산된다. null 이면 cost_won 이 NULL 로 적재되고 llm_usage 에 토큰은
//    남으므로, 나중에 단가를 채워 소급 계산할 수 있다.

/** 두 분석 스크립트와 같은 값이어야 과거 판독과 대조가 성립한다. */
export const USD_KRW = 1400;

/** $/MTok. cacheWrite 는 이 프로젝트가 쓰는 **1시간 TTL** 기준이다(AGENTS.md: ttl:"1h"). */
export interface ModelRate {
  in: number;
  out: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  /** 캐시에서 읽은 입력 토큰(할인 요율). */
  cacheReadTokens: number;
  /** 캐시에 쓴 입력 토큰(할증 요율). */
  cacheWriteTokens: number;
}

// OpenAI 계열 파생 요율 — tiering-cost-reanchor.mjs 와 같은 배수.
const OA_WRITE_MULT = 1.25;
const OA_READ_MULT = 0.1;
const oa = (inp: number, out: number): ModelRate => ({
  in: inp,
  out,
  cacheRead: inp * OA_READ_MULT,
  cacheWrite: inp * OA_WRITE_MULT,
});

/**
 * 현재 코드가 실제로 부르는 모델 전부(`lib/claude/model-registry.ts` · 각 라우트 기준).
 * null = 단가 미확정. 새 모델을 붙이면 여기에 줄을 추가한다 — 안 하면 원가가 NULL 로 샌다.
 */
export const RATES: Record<string, ModelRate | null> = {
  // Anthropic — parse-console-cost.mjs 의 실측 단가
  "claude-sonnet-5": { in: 3, out: 15, cacheRead: 0.3, cacheWrite: 6 },
  "claude-haiku-4-5": { in: 0.8, out: 4, cacheRead: 0.08, cacheWrite: 1.6 },
  "claude-haiku-4-5-20251001": { in: 0.8, out: 4, cacheRead: 0.08, cacheWrite: 1.6 },

  // OpenAI — tiering-cost-reanchor.mjs 의 PRICE_IN/PRICE_OUT
  "gpt-5.6-luna": oa(0.2, 1.2),
  "gpt-5-nano": oa(0.05, 0.4),
  // ⚠️ gpt-5-mini 는 저 스크립트에 단가가 없다 — 사용자 확인 전까지 null.
  "gpt-5-mini": null,

  // Gemini — 저장소에 단가 근거가 없다. 사용자 확인 전까지 null.
  "gemini-3.6-flash": null,
  "gemini-3-flash-preview": null,
};

/**
 * 원가(원). 소수점은 반올림한다.
 * @returns 단가를 모르면 **null** (0 이 아니다).
 */
export function costWon(model: string, u: Usage): number | null {
  const r = RATES[model];
  if (!r) return null; // 미등록 모델과 단가 미확정 모델을 같이 처리한다
  const usd =
    (u.inputTokens / 1e6) * r.in +
    (u.outputTokens / 1e6) * r.out +
    (u.cacheReadTokens / 1e6) * r.cacheRead +
    (u.cacheWriteTokens / 1e6) * r.cacheWrite;
  return Math.round(usd * USD_KRW);
}
