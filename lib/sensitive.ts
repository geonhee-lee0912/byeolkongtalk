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

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

export type SensitiveCategory =
  | "suicide"
  | "school_violence"
  | "domestic_violence"
  | "sexual_violence"
  | "substance_abuse"
  | "other";

export type Severity = 1 | 2 | 3;

export interface SensitiveMatch {
  category: SensitiveCategory;
  severity: Severity;
  matchedKeywords: string[];
  method: "regex" | "claude" | "both";
  certainty: "high" | "medium" | "low";
}

interface Pattern {
  re: RegExp;
  category: SensitiveCategory;
  severity: Severity;
  certainty: "high" | "medium" | "low";
}

const PATTERNS: Pattern[] = [
  // 자살 / 자해
  { re: /자\s*살(?!\s*(놈|자|문|로|님))/, category: "suicide", severity: 3, certainty: "high" },
  { re: /죽\s*고\s*싶/, category: "suicide", severity: 3, certainty: "high" },
  { re: /(끝내|마감)\s*고?\s*싶/, category: "suicide", severity: 2, certainty: "medium" },
  { re: /사라\s*지\s*고\s*싶/, category: "suicide", severity: 2, certainty: "medium" },
  { re: /살\s*기\s*싫/, category: "suicide", severity: 2, certainty: "medium" },
  { re: /없어\s*졌으면/, category: "suicide", severity: 1, certainty: "low" },
  { re: /자\s*해/, category: "suicide", severity: 3, certainty: "high" },
  { re: /(약|수면제|수면유도제).*(먹고|털어|모아)/, category: "suicide", severity: 3, certainty: "high" },
  { re: /(뛰어\s*내리|투신|목\s*매)/, category: "suicide", severity: 3, certainty: "high" },
  { re: /칼.*(긋|손목)/, category: "suicide", severity: 3, certainty: "high" },
  { re: /힘들어\s*죽/, category: "suicide", severity: 1, certainty: "low" },
  { re: /지쳐\s*죽/, category: "suicide", severity: 1, certainty: "low" },
  // 모호한 실존적 절망 — banner + Claude 2차 검토 유도 (회색지대)
  { re: /사는\s*게\s*(의미\s*없|싫|힘들|버겁)/, category: "suicide", severity: 2, certainty: "medium" },
  { re: /(다|모든\s*게|전부)\s*의미\s*없/, category: "suicide", severity: 1, certainty: "low" },
  { re: /더는?\s*못\s*버티/, category: "suicide", severity: 1, certainty: "low" },
  { re: /(다|전부)\s*(놓|포기)\s*(아?\s*버리|하)?\s*고\s*싶/, category: "suicide", severity: 2, certainty: "medium" },

  // 학교폭력 / 따돌림
  { re: /왕따/, category: "school_violence", severity: 2, certainty: "high" },
  { re: /(애들|친구들|반애|반\s*애).*(괴롭|따돌|무시|돌려가)/, category: "school_violence", severity: 2, certainty: "high" },
  { re: /(맞고\s*있|맞아\s*왔|때리)/, category: "school_violence", severity: 2, certainty: "medium" },
  { re: /학교\s*가기\s*싫/, category: "school_violence", severity: 1, certainty: "low" },
  { re: /(단톡|단체\s*톡|반톡).*(괴롭|따돌|당해)/, category: "school_violence", severity: 2, certainty: "high" },
  { re: /(돈|용돈).*(뺏|빼앗|강요)/, category: "school_violence", severity: 2, certainty: "high" },

  // 가정폭력 / 아동학대
  { re: /(아빠|아버지|엄마|어머니|부모).*때려/, category: "domestic_violence", severity: 3, certainty: "high" },
  { re: /(맞고\s*자라|맞고\s*컸|매\s*맞)/, category: "domestic_violence", severity: 3, certainty: "high" },
  { re: /집\s*에?\s*들어가기?\s*무서/, category: "domestic_violence", severity: 2, certainty: "high" },
  { re: /(부모|아빠|엄마).*욕|폭언/, category: "domestic_violence", severity: 1, certainty: "low" },
  { re: /(가정|집).*(폭력|학대)/, category: "domestic_violence", severity: 3, certainty: "high" },

  // 성폭력 / 성희롱
  { re: /(성\s*추행|성\s*폭행|성\s*희롱)/, category: "sexual_violence", severity: 3, certainty: "high" },
  { re: /동의\s*없이.*(만지|키스|관계)/, category: "sexual_violence", severity: 3, certainty: "high" },
  { re: /(강제로|억지로).*(만지|키스|관계|시켜)/, category: "sexual_violence", severity: 3, certainty: "high" },
  { re: /몸을?\s*만져|허락\s*없이.*만져/, category: "sexual_violence", severity: 2, certainty: "medium" },
  { re: /(사진|영상).*(유포|뿌려|올려)/, category: "sexual_violence", severity: 3, certainty: "high" },

  // 약물 / 알코올 / 도박 의존
  { re: /(약|마약|필로폰|대마)\s*끊고\s*싶/, category: "substance_abuse", severity: 2, certainty: "high" },
  { re: /술\s*못?\s*끊/, category: "substance_abuse", severity: 2, certainty: "high" },
  { re: /필름\s*끊겨/, category: "substance_abuse", severity: 1, certainty: "low" },
  { re: /도박\s*끊고?\s*싶|도박\s*중독/, category: "substance_abuse", severity: 2, certainty: "high" },
];

export function detectSensitiveSync(text: string): SensitiveMatch | null {
  if (!text || text.length < 2) return null;
  const normalized = text.toLowerCase();

  let best: SensitiveMatch | null = null;
  const allMatched: string[] = [];

  for (const p of PATTERNS) {
    const m = normalized.match(p.re);
    if (m) {
      allMatched.push(m[0]);
      if (
        !best ||
        p.severity > best.severity ||
        (p.severity === best.severity &&
          p.certainty === "high" &&
          best.certainty !== "high")
      ) {
        best = {
          category: p.category,
          severity: p.severity,
          matchedKeywords: [m[0]],
          method: "regex",
          certainty: p.certainty,
        };
      }
    }
  }

  if (best) best.matchedKeywords = Array.from(new Set(allMatched));
  return best;
}

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
  text: string
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
