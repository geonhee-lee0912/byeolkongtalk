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

/** 전체 대화 비교용 프롬프트 — 두 대화가 서로 다른 흐름일 수 있음을 명시하고 "별콩이다움"으로 판정. */
function convoPrompt(seedConcern: string, a: string, b: string): string {
  return [
    "너는 운세 챗봇 '별콩이'의 두 상담 대화 '전체'를 비교하는 심판이야. 어느 쪽이 더 별콩이다운 상담인지 고른다.",
    "별콩이 화법: 따뜻함+차분함+신비로움, 단정적 예언 금지, 흐름·가능성·선택 3키워드, 답 먼저(회피구 금지), 부정은 완곡+출구, 질문으로 마무리 반복 금지(2연속 질문 금지), 그레이스풀한 마무리.",
    "⚠️ 소신 있는 방향 제시('내가 보기엔 ~')는 권장(위반 아님). 질문 자체도 위반 아님(연속 질문 마무리만 위반).",
    "⚠️ 두 대화는 유저 발화가 서로 다를 수 있다(시뮬레이터가 각 응답에 다르게 반응). 표면 길이·구조가 아니라, 유저에게 '어떻게 반응했는지'의 별콩이다움으로 판정해라.",
    "",
    `## 유저의 최초 고민\n${seedConcern}`,
    `## 대화 A\n${a}`,
    `## 대화 B\n${b}`,
    "",
    '## 출력 — JSON 하나만: {"winner":"A"|"B"|"tie","reason":"한 줄 근거"}',
    "동등하면 tie.",
  ].join("\n");
}

/** blind + 위치 무작위(seedIndex)로 A/B 판정 후 원 라벨로 언블라인드. pairwise/pairwiseConversation 공용. */
async function judgeAB(
  seedIndex: number,
  render: (a: string, b: string) => string,
  baselineContent: string,
  candidateContent: string,
): Promise<{ winner: Slot | "tie"; reason: string }> {
  const baselineIsA = seedIndex % 2 === 0; // 짝수면 A=baseline
  const map = {
    A: (baselineIsA ? "baseline" : "candidate") as Slot,
    B: (baselineIsA ? "candidate" : "baseline") as Slot,
  };
  const a = baselineIsA ? baselineContent : candidateContent;
  const b = baselineIsA ? candidateContent : baselineContent;
  const res = await client.messages.create({
    model: config.PAIRWISE_JUDGE_MODEL,
    max_tokens: 500,
    // adaptive thinking 이 500 예산을 잠식해 빈 JSON 이 나오는 걸 막는다(judge.ts 와 동일).
    thinking: { type: "disabled" },
    messages: [{ role: "user", content: render(a, b) }],
  });
  const text = res.content
    .filter((x): x is Anthropic.TextBlock => x.type === "text")
    .map((x) => x.text)
    .join("");
  const { winner, reason } = parsePairwise(text);
  return { winner: unblind(winner, map), reason };
}

/** 단일 턴(같은 유저 발화 응답) 비교. seedIndex 로 위치 무작위(재현성 — Math.random 미사용). */
export async function pairwise(
  userTurn: string,
  baselineText: string,
  candidateText: string,
  seedIndex: number,
): Promise<{ winner: Slot | "tie"; reason: string }> {
  return judgeAB(seedIndex, (a, b) => prompt(userTurn, a, b), baselineText, candidateText);
}

/** 전체 대화 비교 — reactive 시뮬로 대화가 갈라져 턴 정렬이 무의미할 때 각 대화를 통째로 판정. */
export async function pairwiseConversation(
  seedConcern: string,
  baselineConvo: string,
  candidateConvo: string,
  seedIndex: number,
): Promise<{ winner: Slot | "tie"; reason: string }> {
  return judgeAB(seedIndex, (a, b) => convoPrompt(seedConcern, a, b), baselineConvo, candidateConvo);
}
