// 가운데 토막 고치기 — 한국어 답 한가운데 다른 언어로 나온 낱말 하나를 값싼 모델(haiku)로 한국어 낱말로 바꾼다(lib/odd-chars.ts).
// 낱말만 받는다 — 문장을 다시 쓰게 하지 않아서 앞뒤(위기 안내 번호 포함)는 한 글자도 안 바뀐다. 못 믿을 답은 버리고 지운다.
// 스트림 도중에 그 문장만 기다리게 하므로 시간 제한을 짧게, 재시도는 하지 않는다.
import Anthropic from "@anthropic-ai/sdk";
import { recordUsage } from "@/lib/claude/usage-log";
import type { LogContext } from "@/lib/logger";
import { mapAnthropicUsage } from "@/lib/claude/adapters/anthropic";
import type { OddRepairRequest } from "@/lib/odd-chars";

const MODEL = "claude-haiku-4-5-20251001";
const TIMEOUT_MS = 2500;
const SYSTEM = [
  "한국어 상담 답의 문장 한가운데 낱말 하나가 다른 언어나 깨진 글자(⟦ ⟧ 안)로 잘못 나왔다.",
  "앞뒤 문맥에 맞는 한국어 낱말 하나만 답해. 설명·따옴표·문장부호 없이.",
  "앞뒤에 이미 있는 조사·어미는 붙이지 마(예: '조건이 ⟦unclear⟧하거나'라면 불분명).",
  "뜻을 알 수 없거나 광고·뜻 없는 글자면 - 하나만 답해.",
].join("\n");

const DENY_RE = /없음|모름|알 ?수 ?없|도박|복권|당첨|카지노|베팅|토토|성인|야동|음란/;

/** 모델 답을 믿을 수 있으면 그 낱말, 아니면 null — 짧은 한국어만 */
export function acceptReplacement(raw: string): string | null {
  const w = raw.trim().replace(/^["'“”‘’`]+|["'“”‘’`.,!?…]+$/g, "").trim();
  if (!/^[가-힣]+(?: [가-힣]+)?$/.test(w) || w.length > 10 || DENY_RE.test(w)) return null;
  return w;
}

let client: Anthropic | null = null;

export async function repairOddWord(req: OddRepairRequest, logCtx?: LogContext): Promise<string | null> {
  client ??= new Anthropic({ apiKey: process.env.CLAUDE_API_KEY, timeout: TIMEOUT_MS, maxRetries: 0 });
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 20,
    system: SYSTEM,
    messages: [{ role: "user", content: `${req.before}⟦${req.token}⟧${req.after}` }],
  });
  void recordUsage(MODEL, mapAnthropicUsage(resp.usage), { ...logCtx, route: "lib/odd-chars-repair" });
  const block = resp.content.find((b) => b.type === "text");
  return block && block.type === "text" ? acceptReplacement(block.text) : null;
}
