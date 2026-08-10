// qa/evaluate/pairwise.ts
// Opus pairwise 블라인드 심판 — 같은 유저 발화에 대한 두 응답(기준선 vs 후보)을 상대 비교.
// 측면 라벨(baseline/candidate)을 숨기고 위치(A/B)를 seedIndex 로 무작위 배치해 위치 편향 제거.
// judge.ts(절대 채점)와 달리 여기선 "어느 쪽이 더 별콩이다운가"만 판정한다.
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.ts";

const client = new Anthropic({ apiKey: config.claudeApiKey() });
export type Slot = "baseline" | "candidate";
export type Winner = "A" | "B" | "tie";

/** 심판이 고른 위치(A/B)를 원래 측면 라벨로 되돌린다. tie 는 그대로. */
export function unblind(w: Winner, map: { A: Slot; B: Slot }): Slot | "tie" {
  return w === "tie" ? "tie" : map[w];
}

export function parsePairwise(raw: string): { winner: Winner; reason: string } {
  const c = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const o = JSON.parse(c) as { winner?: string; reason?: string };
    const w = o.winner === "A" || o.winner === "B" ? o.winner : "tie";
    return { winner: w, reason: String(o.reason ?? "") };
  } catch {
    return { winner: "tie", reason: "파싱 실패" };
  }
}

function prompt(userTurn: string, a: string, b: string): string {
  return [
    "너는 운세 챗봇 '별콩이'의 두 응답을 비교하는 심판이야. 어느 쪽이 별콩이 화법에 더 맞는지만 고른다.",
    "별콩이 화법: 따뜻함+차분함+신비로움, 단정적 예언 금지, 흐름·가능성·선택 3키워드, 답 먼저(회피구 금지), 부정은 완곡+출구, 매턴 질문으로 마무리 금지(2연속 질문 금지).",
    "⚠️ 소신 있는 방향 제시('내가 보기엔 ~')는 위반 아니라 권장. 질문 자체는 위반 아님(2연속 질문 마무리만 위반).",
    "",
    `## 유저 발화\n${userTurn}`,
    `## 응답 A\n${a}`,
    `## 응답 B\n${b}`,
    "",
    '## 출력 — JSON 하나만: {"winner":"A"|"B"|"tie","reason":"한 줄 근거"}',
    "동등하거나 못 고르겠으면 tie.",
  ].join("\n");
}

/** 위치 무작위·라벨 숨김 pairwise. seedIndex 로 슬롯 배치를 결정(재현성 — Math.random 미사용). */
export async function pairwise(
  userTurn: string,
  baselineText: string,
  candidateText: string,
  seedIndex: number,
): Promise<{ winner: Slot | "tie"; reason: string }> {
  const baselineIsA = seedIndex % 2 === 0; // 짝수면 A=baseline
  const map = {
    A: (baselineIsA ? "baseline" : "candidate") as Slot,
    B: (baselineIsA ? "candidate" : "baseline") as Slot,
  };
  const a = baselineIsA ? baselineText : candidateText;
  const b = baselineIsA ? candidateText : baselineText;
  const res = await client.messages.create({
    model: config.PAIRWISE_JUDGE_MODEL,
    max_tokens: 500,
    // adaptive thinking 이 500 예산을 잠식해 빈 JSON 이 나오는 걸 막는다(judge.ts 와 동일).
    thinking: { type: "disabled" },
    messages: [{ role: "user", content: prompt(userTurn, a, b) }],
  });
  const text = res.content
    .filter((x): x is Anthropic.TextBlock => x.type === "text")
    .map((x) => x.text)
    .join("");
  const { winner, reason } = parsePairwise(text);
  return { winner: unblind(winner, map), reason };
}
