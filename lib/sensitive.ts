// 민감 주제 키워드 매칭 + Claude 2차 분류
//
// 1단계 — regex 매칭 (~1ms): /api/consultations/saju/chat 응답 지연 거의 0
//   - high: 명확한 위기 시그널 → severity 3 또는 2
//   - low : 회색지대 키워드만 매칭 → Claude 2차로 넘김
//   - none: 매칭 X → 통과
//
// 2단계 — Claude haiku 분류 (~500ms, fire-and-forget):
//   회색지대 텍스트를 비동기로 분류해서 sensitive_alerts INSERT.
//   사용자 응답은 막지 않음.

import Anthropic from "@anthropic-ai/sdk";
import { getServiceSupabase } from "@/lib/supabase";
import { recordUsage } from "@/lib/claude/usage-log";
import { mapAnthropicUsage } from "@/lib/claude/adapters/anthropic";
import {
  detectSensitiveSync,
  type SensitiveCategory,
  type Severity,
  type SensitiveMatch,
} from "./sensitive-patterns.ts";

// 정규식·타입의 원천은 lib/sensitive-patterns.ts — 기존 import 경로(@/lib/sensitive)를 그대로 쓰게 다시 내보낸다
export { detectSensitiveSync };
export type { SensitiveCategory, Severity, SensitiveMatch };

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const CLAIM_SCHEMA = `다음 메시지가 자살/자해, 학교폭력, 가정폭력, 성폭력, 약물중독 중 어느 카테고리에 해당하는 위기 신호인지 판단해.
응답은 정확히 다음 JSON 형식으로만:

{ "category": "suicide|school_violence|domestic_violence|sexual_violence|substance_abuse|other|none",
  "severity": 0|1|2|3,
  "reason": "한 문장 사유" }

기준:
- 0: 위기 신호 없음 (관용 표현, 평범한 푸념)
- 1: 모호한 시그널 (약한 우울감, 일상 스트레스)
- 2: 분명한 위기 (도움 필요)
- 3: 즉시 위험 (자해/자살 임박, 폭력 진행 중)

관용 표현 ("힘들어 죽겠어", "지쳐 죽어") 은 0으로 분류.
실제 위기 시그널만 1 이상으로 분류.`;

export async function detectSensitiveAsync(
  text: string,
  userId?: string | null      // ← 추가. 위와 같은 이유.
): Promise<SensitiveMatch | null> {
  if (!text || text.length < 5) return null;

  const regexMatch = detectSensitiveSync(text);

  // high certainty 면 Claude 호출 불필요 — 즉시 반환
  if (regexMatch?.certainty === "high") return regexMatch;

  // 회색지대 — Claude 2차 호출
  if (!regexMatch && text.length < 15) return null;

  try {
    const resp = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: CLAIM_SCHEMA,
      messages: [{ role: "user", content: text.slice(0, 1500) }],
    });

    // 🔴 회색지대 대화 턴마다 돌 수 있는 경로다 — 누락하면 원가가 조용히 샌다(스펙 §4 착점 3).
    void recordUsage("claude-haiku-4-5-20251001", mapAnthropicUsage(resp.usage), {
      route: "lib/sensitive.detectSensitiveAsync",
      userId,
    });

    const content = resp.content[0];
    if (content.type !== "text") return regexMatch;

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return regexMatch;

    const parsed = JSON.parse(jsonMatch[0]) as {
      category: string;
      severity: number;
      reason?: string;
    };

    if (parsed.severity === 0 || parsed.category === "none") {
      return null;
    }

    if (parsed.severity >= 1 && parsed.severity <= 3) {
      return {
        category: (parsed.category as SensitiveCategory) ?? "other",
        severity: parsed.severity as Severity,
        matchedKeywords: regexMatch?.matchedKeywords ?? [],
        method: regexMatch ? "both" : "claude",
        certainty: parsed.severity === 3 ? "high" : "medium",
      };
    }
  } catch (e) {
    console.warn("[sensitive] Claude 2차 분류 실패:", e);
  }

  return regexMatch;
}

// 게이트 감지 — chat 라우트가 스트림 시작 전에 호출하는 단일 진입점.
// high certainty regex 는 즉시 확정 (같은 턴 배너 + 위기 게이트).
// 회색지대(medium/low)는 haiku 2차 판정을 기다려 확정 — 오탐이면 null 로 걸러짐.
// (2026-07-21 prod 오탐 4건: "끝내고 싶"·"못버티" 연애 어휘가 sync 확정으로 배너 노출)
// 2차 실패/타임아웃 시 regex 결과 유지 (안전한 방향 폴백). 회색지대 턴만 ~1초 지연.
export async function resolveSensitive(
  text: string,
  opts?: {
    timeoutMs?: number;
    /** 2차 판정 주입점(테스트용). userId 는 원가를 유·무료로 분해하려고 흘려보낸다. */
    secondPass?: (text: string, userId?: string | null) => Promise<SensitiveMatch | null>;
    /** llm_usage.user_id 에 실린다. 판정 로직에는 전혀 쓰이지 않는다. */
    userId?: string | null;
  }
): Promise<SensitiveMatch | null> {
  const sync = detectSensitiveSync(text);
  if (!sync) return null;
  if (sync.certainty === "high") return sync;

  const secondPass = opts?.secondPass ?? detectSensitiveAsync;
  const timeoutMs = opts?.timeoutMs ?? 3000;
  try {
    return await Promise.race([
      secondPass(text, opts?.userId),
      new Promise<SensitiveMatch>((resolve) =>
        setTimeout(() => resolve(sync), timeoutMs)
      ),
    ]);
  } catch {
    return sync;
  }
}

export async function recordSensitiveAlert(args: {
  match: SensitiveMatch;
  userId?: string | null;
  anonymousId?: string | null;
  readingId?: string | null;
  messageText: string;
}): Promise<void> {
  try {
    const supa = getServiceSupabase();
    await supa.from("sensitive_alerts").insert({
      user_id: args.userId ?? null,
      anonymous_id: args.anonymousId ?? null,
      reading_id: args.readingId ?? null,
      message_text: args.messageText.slice(0, 500),
      category: args.match.category,
      severity: args.match.severity,
      matched_keywords: args.match.matchedKeywords,
      detection_method: args.match.method,
    });
  } catch (e) {
    console.error("[sensitive] insert failed:", e);
  }
}
