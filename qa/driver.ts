// qa/driver.ts — 시뮬레이터 이벤트를 chat 콜로 실행해 한 대화를 끝까지 진행.
import { config } from "./config.ts";
import { postChat, postRelChat, type ChatResponse } from "./client.ts";
import { nextEvent } from "./simulator.ts";
import { getBalance } from "./seed.ts";
import { createReading } from "./readings.ts";
import { hasEndMarker, hasSkillDoneMarker } from "./evaluate/assertions.ts";
import type { Case, Transcript, TurnRecord, SimEvent } from "./types.ts";

function chatPath(c: Case): string {
  switch (c.product.kind) {
    case "saju":
      return "/api/consultations/saju/chat";
    case "tarot":
      return "/api/consultations/tarot/chat";
    case "relationship":
    case "verdict":
      return "/api/relationship/chat";
  }
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
  await sleep(config.PACING_MS);
  let res: ChatResponse;
  if (c.product.kind === "relationship" || c.product.kind === "verdict") {
    // 스레드/판정 모두 서버가 히스토리 관리 → 단발 message + relationshipId(= t.readingId)
    res = await postRelChat(chatPath(c), {
      relationshipId: t.readingId,
      message: userText,
    });
  } else {
    const messages = [...toApiMessages(t), { role: "user" as const, content: userText }];
    res = await postChat(chatPath(c), { readingId: t.readingId, messages });
  }
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

/** 이 턴으로 대화를 종료해야 하는지 판정 + finishReason 설정.
 *  관계 스레드(패스게이트 402·소프트캡 X-Daily-Cap)와 [END] 수렴을 모두 처리. */
function checkStop(t: Transcript, turn: TurnRecord): boolean {
  if (turn.status === 402) {
    t.finishReason = "pass_gated";
    return true;
  }
  if (turn.headers["x-daily-cap"] === "reached") {
    t.finishReason = "daily_cap";
    return true;
  }
  if (hasEndMarker(turn.assistantText) || hasSkillDoneMarker(turn.assistantText)) {
    t.finishReason = "ended";
    return true;
  }
  return false;
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

  const maxCalls =
    c.product.kind === "relationship"
      ? config.REL_MAX_TURNS
      : config.MAX_CHAT_CALLS_PER_CASE;

  try {
    // verdict: 판정 개시 — skillStart로 30별 차감 + 별콩이 도입(유저 발화 없음)
    if (c.product.kind === "verdict") {
      await sleep(config.PACING_MS);
      const kickoff = await postRelChat("/api/relationship/chat", {
        relationshipId: t.readingId,
        skillStart: "verdict",
      });
      t.turns.push({ userText: "", assistantText: kickoff.text, headers: kickoff.headers, status: kickoff.status, eventType: "say" });
      if (checkStop(t, t.turns[t.turns.length - 1])) {
        t.endBalance = await getBalance();
        return t;
      }
    }
    // 첫 턴: 별콩이 자동 풀이 (서비스 흐름 = seedConcern 을 첫 user 메시지로)
    const first = await sendOne(c, t, c.seedConcern, "say");
    if (checkStop(t, first)) {
      t.endBalance = await getBalance();
      return t;
    }

    // 자연 종료(stop/abandon/[END]/소프트캡/패스게이트) 또는 maxCalls 까지 진행.
    // 관계 스레드는 [END] 가 없어 REL_MAX_TURNS·시뮬 stop·소프트캡으로 종료.
    // (이전엔 maxTurns+4 소프트캡이 타로 멀티카드를 [END] 전에 끊어 false fail → 제거)
    while (t.turns.length < maxCalls) {
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
        let stopped = false;
        for (const line of ev.texts) {
          if (t.turns.length >= maxCalls) break;
          const turn = await sendOne(c, t, line, "burst");
          if (checkStop(t, turn)) { stopped = true; break; }
        }
        if (stopped) break;
        continue;
      }
      // say / idle_resume
      if (ev.type === "idle_resume" && config.IDLE_SLEEP_MS > 0) {
        await sleep(config.IDLE_SLEEP_MS);
      }
      const turn = await sendOne(c, t, ev.text, ev.type);
      if (checkStop(t, turn)) break;
    }
    if (t.turns.length >= maxCalls && t.finishReason === "max_turns") {
      t.finishReason = "max_calls";
    }
  } catch (e) {
    t.finishReason = "error";
    t.error = (e as Error).message;
  }

  t.endBalance = await getBalance();
  return t;
}
