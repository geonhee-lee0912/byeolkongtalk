// qa/driver.ts — 시뮬레이터 이벤트를 chat 콜로 실행해 한 대화를 끝까지 진행.
import { config } from "./config.ts";
import { postChat } from "./client.ts";
import { nextEvent } from "./simulator.ts";
import { getBalance } from "./seed.ts";
import { createReading } from "./readings.ts";
import { hasEndMarker } from "./evaluate/assertions.ts";
import type { Case, Transcript, TurnRecord, SimEvent } from "./types.ts";

function chatPath(c: Case): string {
  return c.product.kind === "saju"
    ? "/api/consultations/saju/chat"
    : "/api/consultations/tarot/chat";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 누적 messages 히스토리(별콩이 입력용)를 transcript에서 재구성 */
function toApiMessages(t: Transcript): { role: "user" | "assistant"; content: string }[] {
  const msgs: { role: "user" | "assistant"; content: string }[] = [];
  for (const turn of t.turns) {
    msgs.push({ role: "user", content: turn.userText });
    if (turn.assistantText) msgs.push({ role: "assistant", content: turn.assistantText });
  }
  return msgs;
}

/** user 발화 1개를 chat에 보내고 응답을 transcript에 turn으로 추가 */
async function sendOne(
  c: Case,
  t: Transcript,
  userText: string,
  eventType: SimEvent["type"]
): Promise<TurnRecord> {
  const messages = [...toApiMessages(t), { role: "user" as const, content: userText }];
  await sleep(config.PACING_MS);
  const res = await postChat(chatPath(c), { readingId: t.readingId, messages });
  const turn: TurnRecord = {
    userText,
    assistantText: res.text,
    headers: res.headers,
    status: res.status,
    eventType,
  };
  t.turns.push(turn);
  return turn;
}

export async function runConversation(c: Case): Promise<Transcript> {
  const startBalance = await getBalance();
  let created;
  try {
    created = await createReading(c);
  } catch (e) {
    return {
      caseId: c.id,
      product: c.product,
      readingId: "",
      cost: 0,
      startBalance,
      endBalance: await getBalance(),
      turns: [],
      finishReason: "error",
      error: (e as Error).message,
    };
  }

  const t: Transcript = {
    caseId: c.id,
    product: c.product,
    readingId: created.readingId,
    cost: created.cost,
    startBalance,
    endBalance: startBalance,
    turns: [],
    finishReason: "max_turns",
  };

  try {
    // 첫 턴: 별콩이 자동 풀이 (서비스 흐름 = reading.question을 첫 user 메시지로)
    await sendOne(c, t, c.seedConcern, "say");
    if (hasEndMarker(t.turns[0].assistantText)) {
      t.finishReason = "ended";
      t.endBalance = await getBalance();
      return t;
    }

    while (t.turns.length < config.MAX_CHAT_CALLS_PER_CASE) {
      const ev = await nextEvent(c, t);

      if (ev.type === "stop") {
        t.finishReason = "ended";
        break;
      }
      if (ev.type === "abandon") {
        t.finishReason = "abandoned";
        break;
      }
      if (ev.type === "burst") {
        let ended = false;
        for (const line of ev.texts) {
          if (t.turns.length >= config.MAX_CHAT_CALLS_PER_CASE) break;
          const turn = await sendOne(c, t, line, "burst");
          if (hasEndMarker(turn.assistantText)) { ended = true; break; }
        }
        if (ended) { t.finishReason = "ended"; break; }
        continue;
      }
      // say / idle_resume
      if (ev.type === "idle_resume" && config.IDLE_SLEEP_MS > 0) {
        await sleep(config.IDLE_SLEEP_MS);
      }
      const userText = ev.type === "say" ? ev.text : ev.text;
      const turn = await sendOne(c, t, userText, ev.type);
      if (hasEndMarker(turn.assistantText)) { t.finishReason = "ended"; break; }

      if (t.turns.length >= c.maxTurns + 4) { t.finishReason = "max_turns"; break; }
    }
    if (t.turns.length >= config.MAX_CHAT_CALLS_PER_CASE) t.finishReason = "max_calls";
  } catch (e) {
    t.finishReason = "error";
    t.error = (e as Error).message;
  }

  t.endBalance = await getBalance();
  return t;
}
