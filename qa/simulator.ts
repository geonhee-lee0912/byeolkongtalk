// qa/simulator.ts — 케이스 페르소나로 다음 사용자 이벤트를 생성.
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.ts";
import type { Case, SimEvent, Transcript } from "./types.ts";

const client = new Anthropic({ apiKey: config.claudeApiKey() });

export function buildSimSystemPrompt(c: Case): string {
  return [
    "너는 운세 상담 서비스를 테스트하기 위한 '가상의 사용자'야. 상담사(별콩이)에게 메시지를 보내는 역할만 한다.",
    "절대 상담사처럼 답하지 말고, 오직 '사용자가 보낼 다음 메시지'만 생성한다.",
    "",
    `## 너의 캐릭터\n${c.userPersona}`,
    `## 말투\n${c.inputStyle.tone}`,
    `## 행동 습관 (태그)\n${c.inputStyle.habits.join(", ")}`,
    `## 원래 고민\n${c.seedConcern}`,
    "",
    "## 출력 형식 — 반드시 JSON 하나만 (설명/코드펜스 금지)",
    '- 한 번 보낼 때: {"type":"say","text":"..."}',
    '- 한 고민을 여러 줄로 쪼개 연속 전송(습관 burst): {"type":"burst","texts":["줄1","줄2","줄3"]}',
    '- 잠수했다 돌아와 이어감(습관 idle): {"type":"idle_resume","text":"..."}',
    '- 그냥 대화 이탈(습관 abandon): {"type":"abandon"}',
    '- 충분히 답을 얻어 자연스럽게 종료: {"type":"stop"}',
    "",
    "habits에 burst/idle/abandon이 있으면 대화 중 적절한 시점에 그 이벤트를 한 번씩 자연스럽게 섞어라.",
    "말투(오타·반말·문장부호 등)를 text에 실제로 반영해라.",
  ].join("\n");
}

/** Claude 응답 텍스트 → SimEvent. 실패 시 stop으로 안전 폴백. */
export function parseSimEvent(raw: string): SimEvent {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const o = JSON.parse(cleaned) as Record<string, unknown>;
    if (o.type === "say" && typeof o.text === "string") return { type: "say", text: o.text };
    if (o.type === "burst" && Array.isArray(o.texts))
      return { type: "burst", texts: o.texts.filter((x): x is string => typeof x === "string") };
    if (o.type === "idle_resume" && typeof o.text === "string")
      return { type: "idle_resume", text: o.text };
    if (o.type === "abandon") return { type: "abandon" };
    if (o.type === "stop") return { type: "stop" };
  } catch {
    /* fallthrough */
  }
  return { type: "stop" };
}

/** 지금까지의 대화를 시뮬레이터 입력 메시지로 변환 (별콩이=assistant 시점 반전).
 *  시뮬레이터 입장에선 '사용자=assistant', '별콩이=user'로 역할을 뒤집어 넣는다. */
function toSimMessages(t: Transcript): { role: "user" | "assistant"; content: string }[] {
  const msgs: { role: "user" | "assistant"; content: string }[] = [];
  for (const turn of t.turns) {
    msgs.push({ role: "assistant", content: turn.userText }); // 내가(사용자가) 보낸 것
    if (turn.assistantText)
      msgs.push({ role: "user", content: turn.assistantText }); // 별콩이가 답한 것
  }
  if (msgs.length === 0) msgs.push({ role: "user", content: "(상담을 시작해줘)" });
  // 마지막이 assistant면(=내가 마지막에 말함) 별콩이 응답 대기 중이므로 호출하지 않음 — 호출 전 보정
  if (msgs[msgs.length - 1].role === "assistant")
    msgs.push({ role: "user", content: "(계속)" });
  return msgs;
}

export async function nextEvent(c: Case, t: Transcript): Promise<SimEvent> {
  const res = await client.messages.create({
    model: config.SIMULATOR_MODEL,
    max_tokens: 400,
    system: buildSimSystemPrompt(c),
    messages: toSimMessages(t),
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return parseSimEvent(text);
}
