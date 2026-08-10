// lib/claude/adapters/anthropic.ts
// anthropic 프로바이더 어댑터 — "1회 순수 스트림"만 담당. 재시도·빈응답 가드·로깅은
// streamChat(lib/claude.ts) 래퍼가 소유한다. lib/claude.ts 의 인라인 구현을 회귀 0 으로 이관.
import Anthropic from "@anthropic-ai/sdk";
import { isRetryableUpstreamError } from "@/lib/upstream-error";
import type { ProviderAdapter, AdapterStreamArgs, StopReason } from "./types";

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

/** SDK 의 raw stop_reason(stop_sequence·tool_use·pause_turn 등)을 어댑터 계약의 StopReason 으로 정규화. */
function mapStop(r: string | null | undefined): StopReason {
  if (r === "end_turn" || r === "max_tokens" || r === "refusal") return r;
  return r == null ? null : "other";
}

export const anthropicAdapter: ProviderAdapter = {
  async *stream({ systemStatic, systemDynamic, messages, maxTokens, model }: AdapterStreamArgs) {
    // 정적 블록만 cache_control 마킹 → TTL 동안 후속 호출은 입력 토큰 0.1× 과금.
    //
    // TTL 1h 를 쓰는 이유(2026-07-26 prod 실측): staticPart 는 페르소나 파일뿐이라 유저 무관 =
    // 같은 도메인의 모든 호출이 캐시 엔트리 하나를 공유하고, 읽기가 TTL 을 갱신한다. 고민톡
    // 호출 간격 중앙값이 1.2분이라 5m 히트율은 84%인데, 미스는 write 1.25× 라 남는 16%가 비싸다.
    // 1h 로 늘리면 히트율 96% — write 가 2.0× 로 오르지만 미스 자체가 1/4 로 줄어 정적 블록
    // 입력비가 약 35% 싸진다. ⚠️ 손익분기는 1h 히트율 ~90% — 트래픽이 지금의 1/3 이하로
    // 떨어지면(간격이 벌어지면) 역전되니 광고 볼륨을 크게 줄일 땐 재측정할 것.
    // systemDynamic 이 없으면(문자열 systemMessage 경로) 단일 블록 + cache_control 없음 — 원 동작 유지.
    const systemBlocks = systemDynamic
      ? [
          {
            type: "text" as const,
            text: systemStatic,
            cache_control: { type: "ephemeral" as const, ttl: "1h" as const },
          },
          { type: "text" as const, text: systemDynamic },
        ]
      : [{ type: "text" as const, text: systemStatic }];

    const stream = anthropic.messages.stream({
      model,
      max_tokens: maxTokens,
      // Sonnet 5 는 adaptive thinking 이 기본 ON — max_tokens(=thinking+응답 총합)를
      // thinking 이 잠식해 [END] 마커·리포트 JSON 이 잘릴 수 있어 4.6 과 동일하게 OFF 유지.
      thinking: { type: "disabled" },
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
