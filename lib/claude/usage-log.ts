// lib/claude/usage-log.ts — llm_usage 에 쓰는 **유일한** 지점.
//
// fire-and-forget 이다: 실패해도 유저 응답을 막지 않는다. 대신 조용히 삼키지 않고 warn 을 남긴다
// (원가가 안 쌓이는 건 나중에 손익이 통째로 틀리는 문제라 흔적이 있어야 한다).
//
// 🔴 이 함수는 **절대 던지면 안 된다.** 호출부가 `void recordUsage(...)` 라 던지면
//    unhandled rejection 이 된다. 그래서 본문 전체를 try/catch 로 감싼다.
import { getServiceSupabase } from "@/lib/supabase";
import { logWarn } from "@/lib/logger";
import type { LogContext } from "@/lib/logger";
import { costWon, type Usage } from "@/lib/claude/pricing";
import { providerOf } from "@/lib/claude/model-registry";

/**
 * 같은 경고를 호출마다 찍지 않는다(프로세스 수명 기준, 키 = `상태:모델`).
 * logWarn 은 error_logs 에 쌓이고 /admin/errors 는 최근 300행만 읽는다 — chat 만 하루 ~135콜이라
 * dedup 이 없으면 이틀이면 창이 덮여 진짜 에러가 밀려난다.
 */
const warnedOnce = new Set<string>();

/** 같은 (상태, 모델) 조합의 첫 번째 호출에만 true. */
function firstTime(kind: string, model: string): boolean {
  const key = `${kind}:${model}`;
  if (warnedOnce.has(key)) return false;
  warnedOnce.add(key);
  return true;
}

/**
 * logCtx.extra 에서 리딩 id 를 꺼낸다. 라우트마다 키 이름이 다르다:
 *   tarot·saju      → readingId
 *   relationship    → threadReadingId  (relationshipId 는 **리딩이 아니라 관계** id 라 안 쓴다)
 *   relationship/sim → simReadingId
 * 셋 다 `readings.id` 를 가리킨다. 키를 하나만 보면 연애·시뮬 경로가 통째로 NULL 로 적재된다.
 */
function readingIdOf(ctx: LogContext | undefined): string | null {
  const e = ctx?.extra;
  for (const k of ["readingId", "threadReadingId", "simReadingId"] as const) {
    const v = e?.[k];
    if (typeof v === "string") return v;
  }
  return null;
}

/**
 * 한 번의 LLM 호출을 기록한다. **await 하지 말 것** — 호출부는 `void recordUsage(...)` 로 쓴다.
 *
 * @param usage 프로바이더가 usage 를 안 준 경우 null → 아무것도 안 쓴다(0 행을 만들면
 *              "토큰 0으로 호출했다"는 거짓이 된다).
 */
export async function recordUsage(
  model: string,
  usage: Usage | null,
  ctx?: LogContext
): Promise<void> {
  try {
    if (!usage) {
      if (firstTime("no-usage", model)) {
        await logWarn("llm usage 없음 — 프로바이더가 토큰을 안 줬다", {
          ...ctx,
          extra: { ...ctx?.extra, model },
        });
      }
      return;
    }
    const cost = costWon(model, usage);
    // 두 실패를 구분해 로그한다 — 처방이 다르다.
    if (cost.status === "unregistered" && firstTime("unregistered", model)) {
      // pricing.ts 에 줄을 안 넣었다는 뜻. 새 모델을 붙일 때마다 나는 신호다.
      await logWarn("llm 단가 미등록 모델 — pricing.ts 에 줄을 추가해야 한다", {
        ...ctx,
        extra: { ...ctx?.extra, model },
      });
    } else if (cost.status === "unpriced" && firstTime("unpriced", model)) {
      // RATES 에 null 로 둔 모델(gemini 2종 등). 토큰은 쌓이니 단가만 채우면 소급 계산된다.
      await logWarn("llm 단가 미확정 모델 — cost_won 이 NULL 로 적재된다", {
        ...ctx,
        extra: { ...ctx?.extra, model },
      });
    }
    // providerOf 는 미등록 모델에 **throw** 한다. 원가 기록이 유저 응답을 망치면 안 되므로 끊는다.
    let provider: string;
    try {
      provider = providerOf(model);
    } catch {
      provider = "unknown";
    }
    const { error } = await getServiceSupabase()
      .from("llm_usage")
      .insert({
        route: ctx?.route ?? null,
        user_id: ctx?.userId ?? null,
        reading_id: readingIdOf(ctx),
        provider,
        model,
        tokens_in: usage.inputTokens,
        tokens_out: usage.outputTokens,
        tokens_cache_read: usage.cacheReadTokens,
        tokens_cache_write: usage.cacheWriteTokens,
        cost_won: cost.status === "ok" ? cost.won : null,
      });
    if (error) {
      await logWarn("llm_usage 적재 실패", {
        ...ctx,
        extra: { ...ctx?.extra, model, dbError: error.message },
      });
    }
  } catch (err) {
    // 원가 기록 실패가 유저 턴을 망치면 안 된다. 흔적만 남긴다.
    await logWarn("llm_usage 적재 중 예외", {
      ...ctx,
      extra: { ...ctx?.extra, model, err: String(err) },
    }).catch(() => {});
  }
}
