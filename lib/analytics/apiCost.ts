// API 원가 배분 — 콘솔 총액(진실)을 리딩별 비용 점수 비중으로 나눈다.
// 총액은 정확하고 배분만 추정이다. 점수는 Sonnet 5 단가 비($/MTok)를 그대로 가중한다.
//
// 종목별 컨텍스트 창이 다르다:
//  - full_history: 사주/타로 상담. 매 턴 전체 히스토리를 보내므로 입력이 초선형으로 커진다.
//  - windowed:     연애 상담 스레드. 최근 N메시지 + rolling_summary 라 입력이 상한에 수렴한다.
//                  (lib/relationship/memory.ts RECENT_MSGS = 24)

export type Turn = { role: "user" | "assistant"; chars: number };
export type CostTrack = "full_history" | "windowed";

export type ScoreInput = {
  turns: Turn[];
  /** 페르소나 + 정적 컨텍스트 글자수 (캐시 마킹 대상) */
  systemChars: number;
  track: CostTrack;
  /** windowed 트랙에서 모델에 보내는 최근 메시지 수 */
  windowMsgs?: number;
  /** windowed 트랙의 rolling_summary 평균 글자수 */
  summaryChars?: number;
  /** 0~1. 정적 블록이 캐시 히트하는 비율 */
  cacheHitRate: number;
};

/** 한국어 근사 — 글자수 ÷ 이 값 ≈ 토큰수 */
export const CHARS_PER_TOKEN = 1.6;
const IN_PRICE_PER_MTOK = 3;
const OUT_PRICE_PER_MTOK = 15;
const CACHE_READ_MULT = 0.1;
const CACHE_WRITE_MULT = 1.25;

export function scoreReading(i: ScoreInput): { inTok: number; outTok: number; score: number } {
  const windowMsgs = i.windowMsgs ?? 24;
  const summaryChars = i.summaryChars ?? 0;
  let inTok = 0;
  let outTok = 0;

  // 정적 블록은 cache_control 로 마킹돼 있으니 콜마다 둘 중 하나다.
  // 히트 = read(0.1×), 미스 = 재기록(write 1.25× — write 단가에 입력값이 포함된다).
  // cacheHitRate 가 이미 전체 콜 중 미스 비율을 담으므로 첫 콜을 따로 write 로 세면 이중 계상이다.
  const sysMult =
    i.cacheHitRate * CACHE_READ_MULT + (1 - i.cacheHitRate) * CACHE_WRITE_MULT;

  for (let t = 0; t < i.turns.length; t++) {
    const turn = i.turns[t];
    if (turn.role !== "assistant") continue; // API 호출 1회 = assistant 응답 1개

    const before = i.turns.slice(0, t);
    const ctx = i.track === "full_history" ? before : before.slice(-windowMsgs);
    const ctxChars = ctx.reduce((a, m) => a + m.chars, 0)
      + (i.track === "windowed" && before.length > windowMsgs ? summaryChars : 0);

    inTok += (i.systemChars * sysMult + ctxChars) / CHARS_PER_TOKEN;
    outTok += turn.chars / CHARS_PER_TOKEN;
  }

  const score = (inTok / 1e6) * IN_PRICE_PER_MTOK + (outTok / 1e6) * OUT_PRICE_PER_MTOK;
  return { inTok, outTok, score };
}

export function allocate<T extends { score: number }>(
  rows: T[],
  totalUsd: number
): (T & { usd: number })[] {
  const sum = rows.reduce((a, r) => a + r.score, 0);
  if (sum <= 0) return rows.map((r) => ({ ...r, usd: 0 }));
  return rows.map((r) => ({ ...r, usd: (r.score / sum) * totalUsd }));
}
